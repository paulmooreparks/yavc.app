# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
"""Consumer acceptance and tamper tests with invented miniature release assets."""
import json
import shutil
import stat
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path
from unittest.mock import patch

import release_record as release


class ReleaseRecordTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="yavc-record-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.assets = self.root / "assets"
        self.assets.mkdir()
        (self.root / "docs").mkdir()
        (self.root / "docs/release-qualifications.json").write_text("[]", encoding="utf-8")
        self.tag = "v0.2.104"
        self.pudl = b"invented upstream distribution"
        upstream = self.assets / "pudl-0.108.0.zip"
        with zipfile.ZipFile(upstream, "w") as zipped:
            zipped.writestr("pudl-0.108.0/dist/pudl.css", self.pudl)
        provenance = {"version": "0.108.0", "tag": "v0.108.0", "commit": "b" * 40,
                      "archive": {"sha256": release.file_hash(upstream)}, "files": {"pudl.css": release.sha256(self.pudl)}}
        (self.root / "docs/pudl-0.108.0.json").write_text(json.dumps(provenance), encoding="utf-8")
        for profile in ("full", "docs"):
            files = {"pudl/pudl.css": self.pudl, "content/fixture.txt": b"invented " + profile.encode()}
            listed = [{"path": name, "bytes": len(data), "sha256": release.sha256(data)} for name, data in sorted(files.items())]
            manifest = {"version": 1, "kind": "portable-content-release-set", "files": listed, "digest": release.content_digest(listed)}
            if profile == "docs":
                manifest["profile"] = "docs"
            zip_name, manifest_name, _ = release.package_names(self.tag, profile)
            data = json.dumps(manifest, indent=2).encode()
            (self.assets / manifest_name).write_bytes(data)
            with zipfile.ZipFile(self.assets / zip_name, "w") as zipped:
                zipped.writestr("manifest.json", data)
                for name, content in files.items():
                    zipped.writestr(name, content)
            self.update_package_checksum(profile)
        self.record_path = release.create_record(self.assets, self.root, self.tag, "a" * 40,
                                                 "https://github.com/paulmooreparks/yavc.app/actions/runs/123")

    def update_package_checksum(self, profile):
        zip_name, manifest_name, checksum = release.package_names(self.tag, profile)
        (self.assets / checksum).write_text("".join(release.file_hash(self.assets / name) + "  " + name + "\n" for name in (zip_name, manifest_name)), encoding="utf-8")

    def update_record(self, change):
        record = release.read_json(self.record_path)
        change(record)
        self.record_path.write_text(json.dumps(record), encoding="utf-8")
        self.record_path.with_suffix(".json.sha256").write_text(release.file_hash(self.record_path) + "  " + self.record_path.name + "\n", encoding="utf-8")

    def repack(self, transform):
        archive = self.assets / release.package_names(self.tag, "full")[0]
        with zipfile.ZipFile(archive) as zipped:
            entries = [(info.filename, zipped.read(info)) for info in zipped.infolist()]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(archive, "w") as zipped:
                for name, data in transform(entries):
                    zipped.writestr(name, data)
        self.update_package_checksum("full")
        self.update_record(lambda record: record["packages"]["full"].update(sha256=release.file_hash(archive), size=archive.stat().st_size))

    def check(self):
        return release.check_record(str(self.record_path), self.assets)

    def test_valid_release_and_retained_extracted_files(self):
        destination = self.root / "verified"
        result = release.check_record(str(self.record_path), self.assets, destination, release.file_hash(self.record_path))
        self.assertTrue(result["verified"])
        self.assertEqual(result["qualifications"], [])
        self.assertEqual((destination / "docs/content/fixture.txt").read_bytes(), b"invented docs")
        with self.assertRaisesRegex(ValueError, "must not exist"):
            release.check_record(str(self.record_path), self.assets, destination)

    def test_tag_download_and_downloaded_record_modes(self):
        def download(url, target, limit):
            source = self.assets / url.rsplit("/", 1)[-1]
            self.assertTrue(url.startswith("https://github.com/paulmooreparks/"))
            self.assertLessEqual(source.stat().st_size, limit)
            shutil.copyfile(source, target)
        with patch.object(release, "download", side_effect=download) as fetch:
            self.assertTrue(release.check_record(self.tag)["verified"])
            self.assertEqual(fetch.call_count, 9)
            self.assertTrue(release.check_record(str(self.record_path))["verified"])

    def test_prepublish_check_downloads_upstream_outside_release_assets(self):
        archive = self.assets / "pudl-0.108.0.zip"
        moved = self.root / archive.name
        archive.rename(moved)
        with patch.object(release, "download", side_effect=lambda url, target, limit: shutil.copyfile(moved, target)) as fetch:
            self.assertTrue(self.check()["verified"])
            self.assertEqual(fetch.call_count, 1)
        self.assertFalse(archive.exists())

    def test_go_json_escaping_and_field_order(self):
        entry = {"sha256": "0" * 64, "extra": "ignored", "path": "<&>\u2028\u2029é", "bytes": 0}
        encoded = '[{"path":"\\u003c\\u0026\\u003e\\u2028\\u2029é","bytes":0,"sha256":"' + "0" * 64 + '"}]'
        self.assertEqual(release.content_digest([entry]), release.sha256(encoded.encode("utf-8")))

    def test_additive_fields_are_accepted(self):
        self.update_record(lambda record: record.update(futureField={"anything": True}))
        self.assertTrue(self.check()["verified"])

    def test_bad_record_checksum_and_pin(self):
        with self.assertRaisesRegex(ValueError, "Pinned"):
            release.check_record(str(self.record_path), self.assets, pinned_hash="0" * 64)
        self.record_path.write_bytes(self.record_path.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "Checksum file mismatch"):
            self.check()

    def test_wrong_schema(self):
        self.update_record(lambda record: record.update(schema=2))
        with self.assertRaisesRegex(ValueError, "schema"):
            self.check()

    def test_tampered_zip(self):
        archive = self.assets / release.package_names(self.tag, "docs")[0]
        archive.write_bytes(archive.read_bytes()[:-1] + b"x")
        with self.assertRaisesRegex(ValueError, "ZIP SHA-256"):
            self.check()

    def test_tampered_file_with_updated_outer_hashes(self):
        self.repack(lambda entries: [(name, b"x" * len(data) if name == "content/fixture.txt" else data) for name, data in entries])
        with self.assertRaisesRegex(ValueError, "Extracted file mismatch"):
            self.check()

    def test_duplicate_and_unexpected_zip_entries(self):
        self.repack(lambda entries: entries + [entries[1]])
        with self.assertRaisesRegex(ValueError, "entry count"):
            self.check()

    def test_duplicate_zip_path_with_unchanged_entry_count(self):
        self.repack(lambda entries: entries[:-1] + [entries[1]])
        with self.assertRaisesRegex(ValueError, "Duplicate ZIP path"):
            self.check()

    def test_unexpected_zip_path_with_unchanged_entry_count(self):
        self.repack(lambda entries: [("unexpected.txt" if name == "content/fixture.txt" else name, data) for name, data in entries])
        with self.assertRaisesRegex(ValueError, "ZIP files differ"):
            self.check()

    def test_symlink_entry_with_updated_outer_hashes(self):
        def change(entries):
            result = []
            for name, data in entries:
                if name == "content/fixture.txt":
                    info = zipfile.ZipInfo(name)
                    info.create_system = 3
                    info.external_attr = (stat.S_IFLNK | 0o777) << 16
                    result.append((info, b"../../outside"))
                else:
                    result.append((name, data))
            return result
        self.repack(change)
        with self.assertRaisesRegex(ValueError, "Nonregular"):
            self.check()

    def test_duplicate_record_members_are_rejected(self):
        self.record_path.write_text('{"schema":1,"schema":1}', encoding="utf-8")
        self.record_path.with_suffix(".json.sha256").write_text(release.file_hash(self.record_path) + "  " + self.record_path.name + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Duplicate JSON member"):
            self.check()

    def test_escaping_zip_path_with_updated_outer_hashes(self):
        self.repack(lambda entries: [("../escape" if name == "content/fixture.txt" else name, data) for name, data in entries])
        with self.assertRaisesRegex(ValueError, "Unsafe file path"):
            self.check()
        self.assertFalse((self.root / "escape").exists())

    def test_internal_manifest_must_equal_external_manifest(self):
        self.repack(lambda entries: [(name, data + b" " if name == "manifest.json" else data) for name, data in entries])
        with self.assertRaisesRegex(ValueError, "Internal/external"):
            self.check()

    def test_bad_content_digest_even_when_record_hash_is_updated(self):
        manifest_path = self.assets / release.package_names(self.tag, "full")[1]
        manifest = release.read_json(manifest_path)
        manifest["digest"] = "0" * 64
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        self.update_package_checksum("full")
        self.update_record(lambda record: record["packages"]["full"].update(manifestSha256=release.file_hash(manifest_path), contentDigest="0" * 64))
        with self.assertRaisesRegex(ValueError, "Content digest"):
            self.check()

    def test_bad_pudl_archive(self):
        archive = self.assets / "pudl-0.108.0.zip"
        archive.write_bytes(b"tampered archive")
        with self.assertRaisesRegex(ValueError, "PUDL archive SHA-256"):
            self.check()

    def test_missing_asset_is_a_failure(self):
        (self.assets / release.package_names(self.tag, "docs")[0]).unlink()
        with self.assertRaises(OSError):
            self.check()

    def test_no_overwrite_and_provenance_must_match_both_packages(self):
        with self.assertRaises(FileExistsError):
            release.create_record(self.assets, self.root, self.tag, "a" * 40, "https://github.com/paulmooreparks/yavc.app/actions/runs/123")
        provenance = self.root / "docs/pudl-0.108.0.json"
        data = release.read_json(provenance)
        data["files"]["pudl.css"] = "0" * 64
        provenance.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            release.create_record(self.assets, self.root, self.tag, "a" * 40, "https://github.com/paulmooreparks/yavc.app/actions/runs/123")


if __name__ == "__main__":
    unittest.main()
