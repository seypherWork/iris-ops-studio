import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

source_file = Path(__file__).resolve().parents[2] / "src/python/irisops_logs.py"
spec = importlib.util.spec_from_file_location("logs", source_file)
logs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(logs)


@unittest.skipUnless(hasattr(os, "O_NOFOLLOW") and os.open in os.supports_dir_fd,
                     "POSIX reader requires Linux/IRIS validation; not exercised on Windows")
class NativeLogReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.path = self.root / "messages.log"

    def tearDown(self):
        self.temp.cleanup()

    def page(self, cursor="", source="messages"):
        return logs.read_page(self.root, source, cursor)

    def test_backwards_pages_have_no_duplicates_or_gaps(self):
        self.path.write_bytes(b"".join(f"event-{n}\n".encode() for n in range(400)))
        seen = []
        page = self.page()
        while True:
            self.assertLessEqual(len(page["records"]), logs.MAX_LINES)
            seen = [r["message"] for r in page["records"]] + seen
            if not page["nextCursor"]:
                break
            page = self.page(page["nextCursor"])
        self.assertEqual(seen, [f"event-{n}" for n in range(400)])

    def test_empty_is_distinct_from_absent(self):
        with self.assertRaises(logs.LogError) as error:
            self.page()
        self.assertEqual(error.exception.code, "source_absent")
        self.path.touch()
        self.assertEqual(self.page()["records"], [])

    def test_sources_are_fixed_identifiers(self):
        for source in ["../messages", "/etc/passwd", "messages.log", "", None, [], "MESSAGES"]:
            with self.subTest(source=source), self.assertRaises(logs.LogError):
                self.page(source=source)

    def test_symlink_and_fifo_are_refused_without_blocking(self):
        outside = self.root / "private"
        outside.write_text("do not read")
        self.path.symlink_to(outside)
        with self.assertRaises(logs.LogError):
            self.page()
        self.path.unlink()
        os.mkfifo(self.path)
        with self.assertRaises(logs.LogError):
            self.page()

    def test_utf8_crlf_and_incomplete_write(self):
        self.path.write_bytes("Événement\r\nرسالة\nunfinished".encode())
        page = self.page()
        self.assertEqual([r["message"] for r in page["records"]], ["Événement", "رسالة"])
        self.assertTrue(page["partial"]["incompleteTail"])
        self.assertEqual(page["nextCursor"], "")

    def test_large_file_reads_bounded_bytes_and_keeps_progress(self):
        self.path.write_bytes(b"first\n" + b"x" * 180000 + b"\nlast\n")
        total = []
        real_read = os.read
        def bounded(fd, size):
            self.assertLessEqual(size, logs.MAX_BYTES + 1)
            return real_read(fd, size)
        with patch.object(logs.os, "read", side_effect=bounded):
            page = self.page()
            for _ in range(10):
                total = [r["message"] for r in page["records"]] + total
                if not page["nextCursor"]:
                    break
                page = self.page(page["nextCursor"])
            else:
                self.fail("Cursor did not make progress")
        self.assertEqual(total, ["first", "last"])

    def test_rotation_append_and_truncation_invalidate_cursor(self):
        original = b"line\n" * 300
        for action in ["append", "truncate", "replace"]:
            self.path.write_bytes(original)
            cursor = self.page()["nextCursor"]
            if action == "append":
                with self.path.open("ab") as file:
                    file.write(b"new\n")
            elif action == "truncate":
                self.path.write_bytes(b"short\n")
            else:
                replacement = self.root / "replacement"
                replacement.write_bytes(original)
                replacement.replace(self.path)
            with self.subTest(action=action), self.assertRaises(logs.LogError) as error:
                self.page(cursor)
            self.assertEqual(error.exception.code, "source_changed")

    def test_modification_during_read_returns_no_records(self):
        self.path.write_bytes(b"first\n")
        real_read = os.read
        def changed(fd, count):
            value = real_read(fd, count)
            with self.path.open("ab") as file:
                file.write(b"later\n")
            return value
        with patch.object(logs.os, "read", side_effect=changed), self.assertRaises(logs.LogError):
            self.page()

    def test_malformed_cross_source_and_unbounded_cursors(self):
        self.path.write_bytes(b"line\n" * 300)
        snapshot = self.page()["snapshot"]
        cases = ["!", "a" * 513, "e30", logs.encode_cursor("alerts", snapshot, 50),
                 logs.encode_cursor("messages", snapshot, -1),
                 logs.encode_cursor("messages", snapshot, 999999)]
        for cursor in cases:
            with self.subTest(cursor=cursor[:12]), self.assertRaises(logs.LogError):
                self.page(cursor)

    def test_known_credentials_are_removed_before_transport(self):
        secret = "SYNTHETIC-CREDENTIAL"
        lines = [f"error password={secret}", f'api_key="{secret}"', f"Bearer {secret}",
                 f"https://example.invalid/?token={secret}",
                 "-----BEGIN PRIVATE KEY-----", secret, "-----END PRIVATE KEY-----"]
        self.path.write_text("\n".join(lines) + "\n")
        response = logs.response(self.root, "messages")
        self.assertNotIn(secret, response)
        self.assertIn("REDACTED", response)

    def test_pem_body_at_page_boundary_is_redacted(self):
        self.path.write_text("-----BEGIN PRIVATE KEY-----\n" + ("A" * 64 + "\n") * 200 + "-----END PRIVATE KEY-----\n")
        response = logs.response(self.root, "messages")
        self.assertNotIn("A" * 64, response)

    def test_errors_do_not_disclose_paths(self):
        response = json.loads(logs.response(self.root, "messages"))
        self.assertEqual(response["httpStatus"], 404)
        self.assertNotIn(str(self.root), json.dumps(response))

    def test_control_bytes_do_not_create_fictitious_records(self):
        self.path.write_bytes(b"first\rcontinued\x0btext\ninvalid-\xff\n")
        page = self.page()
        self.assertEqual(len(page["records"]), 2)
        self.assertEqual(page["records"][1]["offset"], len(b"first\rcontinued\x0btext\n"))
        self.assertTrue(page["partial"]["invalidEncoding"])

    def test_expanding_redaction_stays_within_response_record_limit(self):
        self.path.write_bytes(("password=x " * 700 + "\n").encode())
        page = self.page()
        self.assertLessEqual(len(page["records"][0]["message"]), logs.MAX_LINE_BYTES)
        self.assertEqual(page["partial"]["shortenedRecords"], 1)

    def test_credentials_in_url_are_redacted(self):
        self.assertNotIn("SYNTHETIC", logs.redact("https://user:SYNTHETIC@example.invalid/path"))


class TextRedactionTests(unittest.TestCase):
    def test_unsupported_filesystem_fails_explicitly_without_opening_any_file(self):
        with patch.object(logs.os, "supports_dir_fd", set()):
            response = json.loads(logs.response("not-a-real-directory", "messages"))
        self.assertEqual(response["httpStatus"], 503)
        self.assertEqual(response["code"], "unsupported_platform")
        self.assertNotIn("not-a-real-directory", json.dumps(response))

    def test_control_normalization_cannot_reveal_a_secret_after_redaction(self):
        for text in ["pass\x00word=SYNTHETIC", "pass\x1b[31mword=SYNTHETIC", "to\x0cken=SYNTHETIC"]:
            self.assertNotIn("SYNTHETIC", logs.redact(text))

    def test_short_pem_tail_is_redacted_without_the_header(self):
        lines = ["normal event", "A" * 64, "AQAB", "-----END PRIVATE KEY-----", "event afterward"]
        result = logs.redact_lines(lines)
        self.assertEqual(result[0], lines[0])
        self.assertEqual(result[-1], lines[-1])
        self.assertNotIn("AQAB", "\n".join(result))
        self.assertNotIn("A" * 64, "\n".join(result))

    def test_pem_unclosed_on_page_never_emits_following_key_material(self):
        self.assertEqual(logs.redact_lines(["-----BEGIN RSA PRIVATE KEY-----", "AQAB"]),
                         ["[REDACTED PRIVATE KEY]", "[REDACTED PRIVATE KEY]"])

    def test_all_known_text_patterns_are_removed(self):
        for text in ['"client_secret":"SYNTHETIC"', "Basic SYNTHETIC", "token=SYNTHETIC",
                     "https://user:SYNTHETIC@example.invalid/path", "password='SYNTHETIC'"]:
            self.assertNotIn("SYNTHETIC", logs.redact(text))


if __name__ == "__main__":
    unittest.main()
