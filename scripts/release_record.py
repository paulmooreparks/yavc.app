# Copyright 2026 Paul Parks. SPDX-License-Identifier: Apache-2.0
"""Create or verify YAVC release records with Python 3.10+ and its standard library."""
import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REPOSITORY = "paulmooreparks/yavc.app"
BASE = "https://github.com/" + REPOSITORY + "/releases/download/"
ROOT = Path(__file__).resolve().parent.parent
MAX_FILE = 256 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024
README = {
    "contentDigest": "SHA-256 of UTF-8 compact JSON of the path-sorted manifest files array, "
    "with each entry reduced to path, bytes, sha256 in that field order, no newline, "
    "and Go encoding/json escaping of <, >, &, U+2028 and U+2029.",
    "image": "Omitted because image.yml publishes independently. The content workflow does not wait "
    "for that workflow or infer its digest from a potentially absent or replaced registry tag.",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def object_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON member: " + key)
        result[key] = value
    return result


def read_json(path):
    require(path.stat().st_size <= MAX_JSON, "JSON exceeds size limit: " + str(path))
    return json.loads(path.read_bytes().decode("utf-8"), object_pairs_hook=object_pairs,
                      parse_constant=lambda value: require(False, "Non-JSON numeric constant: " + value))


def is_hash(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def tag_name(tag):
    require(isinstance(tag, str) and re.fullmatch(r"v[0-9][A-Za-z0-9.+-]*", tag), "Invalid release tag")
    return tag


def safe_path(name):
    require(isinstance(name, str) and name and not any(c in name for c in "\\:\x00"), "Unsafe file path: " + repr(name))
    parts = name.split("/")
    require(all(part and part not in (".", "..") and not part.endswith((".", " ")) for part in parts), "Unsafe file path: " + name)
    require(not any(ord(c) < 32 or c in '<>"|?*' for c in name), "Nonportable file path: " + name)
    require(not any(re.fullmatch(r"(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?", part) for part in parts), "Reserved file path: " + name)
    return name


def content_digest(files):
    entries = [{"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"]} for row in files]
    encoded = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    for char, escape in (("<", "\\u003c"), (">", "\\u003e"), ("&", "\\u0026"), ("\u2028", "\\u2028"), ("\u2029", "\\u2029")):
        encoded = encoded.replace(char, escape)
    return sha256(encoded.encode("utf-8"))


def inventory(path, profile):
    manifest = read_json(path)
    require(manifest["version"] == 1 and manifest["kind"] == "portable-content-release-set", "Unsupported package manifest")
    require(manifest.get("profile", "full") == profile, "Package profile mismatch")
    files = manifest["files"]
    require(isinstance(files, list) and 0 < len(files) <= 10000, "Invalid manifest file count")
    previous, aliases, total = "", set(), 0
    for row in files:
        name = safe_path(row["path"])
        require(name != "manifest.json" and name > previous and name.casefold() not in aliases, "Duplicate or unsorted manifest path: " + name)
        require(type(row["bytes"]) is int and 0 <= row["bytes"] <= MAX_FILE and is_hash(row["sha256"]), "Invalid file metadata: " + name)
        previous = name
        aliases.add(name.casefold())
        total += row["bytes"]
    require(total <= MAX_TOTAL, "Package exceeds size limit")
    require(content_digest(files) == manifest["digest"], "Content digest mismatch: " + profile)
    return manifest


def host_paths(manifest):
    names = {row["path"] for row in manifest["files"]}
    declared = manifest.get("hostOnly")
    if declared is None:
        return None  # Historical manifests predate this declaration; locally reconstructed records can still verify their payloads.
    require(isinstance(declared, list) and all(isinstance(name, str) for name in declared), "Invalid hostOnly declaration")
    require(declared == sorted(set(declared)) and set(declared) <= names, "hostOnly must be sorted, unique and manifest-listed")
    return declared


def git(root, *arguments):
    result = subprocess.run(["git", "-C", str(root), "-c", "i18n.logOutputEncoding=UTF-8", *arguments], check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    require(result.returncode == 0, "Git failed: " + result.stderr.decode("utf-8", errors="replace"))
    return result.stdout.decode("utf-8").strip()


def release_changes(root, commit):
    require(git(root, "rev-parse", "--is-shallow-repository") == "false", "Release history requires a complete clone")
    require(git(root, "rev-parse", "--verify", commit + "^{commit}") == commit, "Source commit is not available")
    ancestors = git(root, "rev-list", "--first-parent", commit).splitlines()[1:]
    tagged = {}
    for tag in git(root, "tag", "--list", "v*", "--sort=-version:refname").splitlines():
        tag_name(tag)
        sha = git(root, "rev-parse", "--verify", "refs/tags/" + tag + "^{commit}")
        tagged.setdefault(sha, tag)
    previous = next((tagged[sha] for sha in ancestors if sha in tagged), None)
    history = git(root, "log", "--first-parent", "--reverse", "--format=%H%x00%s%x00", (previous + ".." if previous else "") + commit)
    changes = []
    fields = history.split("\x00")
    require(fields[-1] == "" and len(fields) % 2 == 1, "Invalid Git history framing")
    for index in range(0, len(fields) - 1, 2):
        sha, title = fields[index].lstrip("\n"), fields[index + 1]
        suffix = re.search(r"\s+\(#([0-9]+)\)$", title)
        changes.append({"pr": int(suffix.group(1)) if suffix else None, "title": title[:suffix.start()] if suffix else title, "commit": sha})
    return previous, changes


def package_names(tag, profile):
    stem = "yavc-content-" + ("docs-" if profile == "docs" else "") + tag
    return stem + ".zip", stem + ".manifest.json", stem + ".sha256"


def check_sums(path, expected):
    require(path.stat().st_size <= MAX_JSON, "Checksum file exceeds size limit")
    found = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64}) [ *](.+)", line)
        require(match is not None, "Invalid checksum line: " + str(path))
        digest, name = match.groups()
        require(name not in found, "Duplicate checksum entry: " + name)
        found[name] = digest
    require(found == expected, "Checksum file mismatch: " + str(path))


def inspect_package(assets, tag, profile, entry, output):
    zip_name, manifest_name, checksum_name = package_names(tag, profile)
    require(entry["fileName"] == zip_name and entry["manifestFileName"] == manifest_name, "Package asset name mismatch")
    archive, external = assets / zip_name, assets / manifest_name
    require(type(entry["size"]) is int and 0 < entry["size"] <= MAX_TOTAL and archive.stat().st_size == entry["size"], "ZIP size mismatch: " + profile)
    require(file_hash(archive) == entry["sha256"], "ZIP SHA-256 mismatch: " + profile)
    require(file_hash(external) == entry["manifestSha256"], "Manifest SHA-256 mismatch: " + profile)
    check_sums(assets / checksum_name, {zip_name: entry["sha256"], manifest_name: entry["manifestSha256"]})
    manifest = inventory(external, profile)
    host_paths(manifest)
    require(entry["contentDigest"] == manifest["digest"] and type(entry["fileCount"]) is int and entry["fileCount"] == len(manifest["files"]), "Record inventory mismatch: " + profile)
    expected = {row["path"]: row for row in manifest["files"]}
    with zipfile.ZipFile(archive) as zipped:
        infos = zipped.infolist()
        require(len(infos) == len(expected) + 1, "Unexpected ZIP entry count: " + profile)
        names, aliases = set(), set()
        for info in infos:
            require(info.orig_filename == info.filename, "Truncated ZIP filename")
            name = safe_path(info.filename)
            require(name not in names and name.casefold() not in aliases, "Duplicate ZIP path: " + name)
            names.add(name)
            aliases.add(name.casefold())
            mode = stat.S_IFMT(info.external_attr >> 16)
            require(mode in (0, stat.S_IFREG) and not info.is_dir() and not info.flag_bits & 1, "Nonregular or encrypted ZIP entry: " + name)
            require(info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "Unsupported ZIP compression")
            require(info.file_size <= (MAX_JSON if name == "manifest.json" else MAX_FILE), "ZIP entry exceeds size limit")
        require(names == set(expected) | {"manifest.json"}, "ZIP files differ from manifest: " + profile)
        require(zipped.read("manifest.json") == external.read_bytes(), "Internal/external manifest mismatch: " + profile)
        output.mkdir()
        for info in infos:
            if info.filename != "manifest.json":
                require(info.file_size == expected[info.filename]["bytes"], "ZIP entry size mismatch: " + info.filename)
            target = output / info.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(info) as source, target.open("xb") as destination:
                count = 0
                while chunk := source.read(1024 * 1024):
                    count += len(chunk)
                    require(count <= info.file_size, "Expanded ZIP entry exceeds declared size")
                    destination.write(chunk)
            require(count == info.file_size, "Truncated ZIP entry: " + info.filename)
        for name, row in expected.items():
            extracted = output / name
            require(extracted.stat().st_size == row["bytes"] and file_hash(extracted) == row["sha256"], "Extracted file mismatch: " + name)
    return manifest


def matching_pudl(root, manifests):
    actual = [{row["path"][len("pudl/"):]: row["sha256"] for row in manifest["files"] if row["path"].startswith("pudl/")} for manifest in manifests]
    matches = []
    for path in (root / "docs").glob("pudl-*.json"):
        provenance = read_json(path)
        if "files" in provenance and all(files == provenance["files"] for files in actual):
            matches.append((path, provenance))
    require(len(matches) == 1, "Packaged PUDL must match exactly one repository provenance file")
    path, source = matches[0]
    return {"version": source["version"], "tag": source["tag"], "commit": source["commit"], "archiveSha256": source["archive"]["sha256"],
            "provenanceFile": path.relative_to(root).as_posix()}


def create_record(assets, root, tag, commit, run_url):
    tag_name(tag)
    packages = {}
    for profile in ("full", "docs"):
        zip_name, manifest_name, _ = package_names(tag, profile)
        manifest = inventory(assets / manifest_name, profile)
        packages[profile] = {"fileName": zip_name, "sha256": file_hash(assets / zip_name), "size": (assets / zip_name).stat().st_size,
                             "manifestFileName": manifest_name, "manifestSha256": file_hash(assets / manifest_name),
                             "contentDigest": manifest["digest"], "fileCount": len(manifest["files"])}
    with tempfile.TemporaryDirectory(prefix="yavc-record-build-") as scratch:
        manifests = [inspect_package(assets, tag, profile, entry, Path(scratch) / profile) for profile, entry in packages.items()]
    declarations = [host_paths(manifest) for manifest in manifests]
    require(all(paths is not None for paths in declarations), "The build must declare hostOnly for every package")
    host_only = sorted({name for paths in declarations for name in paths})
    previous, changes = release_changes(root, commit)
    qualification_source = "docs/release-qualifications.json"
    qualifications = read_json(root / qualification_source)
    require(isinstance(qualifications, list), "Qualifications must be an array")
    record = {"schema": 1, "version": tag, "commit": commit, "writtenAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
              "workflowRunUrl": run_url, "packages": packages, "pudl": matching_pudl(root, manifests),
              "qualificationSource": qualification_source, "qualifications": qualifications, "readme": README,
              "previousVersion": previous, "changes": changes, "hostOnly": host_only}
    validate_record(record)
    path = assets / ("yavc-release-" + tag + ".json")
    data = (json.dumps(record, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    with path.open("xb") as stream:
        stream.write(data)
    with path.with_suffix(".json.sha256").open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(sha256(data) + "  " + path.name + "\n")
    return path


def validate_record(record):
    require(type(record["schema"]) is int and record["schema"] == 1, "Unsupported release record schema")
    tag_name(record["version"])
    require(re.fullmatch(r"[0-9a-f]{40}", record["commit"]), "Invalid source commit")
    if record["previousVersion"] is not None:
        tag_name(record["previousVersion"])
    changes = record["changes"]
    require(isinstance(changes, list) and changes, "Release changes must be a nonempty array")
    for change in changes:
        require((change["pr"] is None or type(change["pr"]) is int) and isinstance(change["title"], str)
                and re.fullmatch(r"[0-9a-f]{40}", change["commit"]), "Invalid release change")
    require(changes[-1]["commit"] == record["commit"] and len({change["commit"] for change in changes}) == len(changes), "Release changes must end at the source commit without duplicates")
    paths = record["hostOnly"]
    require(isinstance(paths, list) and all(isinstance(name, str) for name in paths), "Invalid record hostOnly")
    require(paths == sorted(set(paths)), "Record hostOnly must be sorted and unique")
    for name in paths:
        safe_path(name)
    require(record["writtenAt"].endswith("Z"), "Record timestamp must be UTC")
    datetime.fromisoformat(record["writtenAt"].replace("Z", "+00:00"))
    require(re.fullmatch(r"https://github\.com/paulmooreparks/yavc\.app/actions/runs/[0-9]+", record["workflowRunUrl"]), "Invalid workflow run URL")
    require(isinstance(record["qualifications"], list) and record["qualificationSource"] == "docs/release-qualifications.json", "Invalid qualifications")
    require(all(isinstance(item, dict) and all(isinstance(item.get(key), str) and item[key] for key in ("id", "status", "scope", "reason", "owner")) for item in record["qualifications"]), "Invalid qualification entry")
    require(isinstance(record["readme"], dict) and all(isinstance(record["readme"].get(key), str) for key in ("contentDigest", "image")), "Missing record README")
    for profile in ("full", "docs"):
        entry = record["packages"][profile]
        require(all(is_hash(entry[key]) for key in ("sha256", "manifestSha256", "contentDigest")), "Invalid package digest")
    pudl = record["pudl"]
    require(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", pudl["version"]) and pudl["tag"] == "v" + pudl["version"], "Invalid PUDL version or tag")
    require(re.fullmatch(r"[0-9a-f]{40}", pudl["commit"]) and is_hash(pudl["archiveSha256"]), "Invalid PUDL provenance")
    require(pudl["provenanceFile"] == "docs/pudl-" + pudl["version"] + ".json", "Invalid PUDL provenance filename")


def download(url, destination, limit):
    request = urllib.request.Request(url, headers={"User-Agent": "yavc-release-check/1"})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("xb") as output:
        require(response.geturl().startswith("https://"), "Refusing insecure download")
        count = 0
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            require(count <= limit, "Download exceeds size limit")
            output.write(chunk)


def verify_pudl(archive, provenance, manifests):
    require(archive.stat().st_size <= MAX_TOTAL and file_hash(archive) == provenance["archiveSha256"], "PUDL archive SHA-256 mismatch")
    prefix = "pudl-" + provenance["version"] + "/dist/"
    with zipfile.ZipFile(archive) as zipped:
        files = {}
        total = 0
        for info in zipped.infolist():
            if not info.filename.startswith(prefix) or info.is_dir():
                continue
            name = safe_path(info.filename[len(prefix):])
            require(name not in files and info.file_size <= MAX_FILE, "Invalid PUDL distribution entry")
            total += info.file_size
            require(total <= MAX_TOTAL, "PUDL distribution exceeds size limit")
            files[name] = sha256(zipped.read(info))
    require(files, "PUDL archive has no distribution")
    for manifest in manifests:
        packaged = {row["path"][len("pudl/"):]: row["sha256"] for row in manifest["files"] if row["path"].startswith("pudl/")}
        require(packaged == files, "Packaged PUDL differs from its upstream archive")


def verify_attestation(artifact, record):
    workflow = REPOSITORY + "/.github/workflows/content-release.yml"
    ref = "refs/tags/" + record["version"]
    command = ["gh", "attestation", "verify", str(artifact), "--hostname", "github.com",
               "--repo", REPOSITORY,
               "--cert-identity", "https://github.com/" + workflow + "@" + ref,
               "--cert-oidc-issuer", "https://token.actions.githubusercontent.com",
               "--source-ref", ref, "--source-digest", record["commit"],
               "--predicate-type", "https://slsa.dev/provenance/v1"]
    result = subprocess.run(command, capture_output=True, timeout=120,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    require(result.returncode == 0, "Attestation verification failed for " + artifact.name + ": " +
            result.stderr.decode("utf-8", errors="replace").strip())


def check_record(record_or_tag, assets_dir=None, output_dir=None, pinned_hash=None, attestation=False):
    with tempfile.TemporaryDirectory(prefix="yavc-release-check-") as scratch:
        scratch = Path(scratch)
        if Path(record_or_tag).is_file():
            record_path = Path(record_or_tag).resolve()
        else:
            tag = tag_name(record_or_tag)
            record_path = scratch / ("yavc-release-" + tag + ".json")
            for name in (record_path.name, record_path.name + ".sha256"):
                download(BASE + tag + "/" + name, scratch / name, MAX_JSON)
        digest = file_hash(record_path)
        require(pinned_hash is None or digest == pinned_hash, "Pinned release-record SHA-256 mismatch")
        check_sums(record_path.with_suffix(".json.sha256"), {record_path.name: digest})
        record = read_json(record_path)
        validate_record(record)
        tag = record["version"]
        require(record_path.name == "yavc-release-" + tag + ".json", "Release-record filename/tag mismatch")
        if attestation:
            verify_attestation(record_path, record)
        assets = Path(assets_dir).resolve() if assets_dir else scratch / "assets"
        if not assets_dir:
            assets.mkdir()
            for profile in ("full", "docs"):
                for name in package_names(tag, profile):
                    download(BASE + tag + "/" + name, assets / name, MAX_TOTAL if name.endswith(".zip") else MAX_JSON)
        manifests = [inspect_package(assets, tag, profile, record["packages"][profile], scratch / profile) for profile in ("full", "docs")]
        names = {row["path"] for manifest in manifests for row in manifest["files"]}
        require(set(record["hostOnly"]) <= names, "Record hostOnly contains an unlisted file")
        declarations = [host_paths(manifest) for manifest in manifests]
        require(all(paths is not None for paths in declarations) or all(paths is None for paths in declarations), "Packages mix declared and historical hostOnly metadata")
        if all(paths is not None for paths in declarations):
            require(record["hostOnly"] == sorted({name for paths in declarations for name in paths}), "Record hostOnly differs from the build declarations")
        pudl = record["pudl"]
        pudl_name = "pudl-" + pudl["version"] + ".zip"
        upstream = assets / pudl_name
        if not upstream.is_file():
            upstream = scratch / pudl_name
            download("https://github.com/paulmooreparks/pudl/releases/download/" + pudl["tag"] + "/" + pudl_name, upstream, MAX_TOTAL)
        verify_pudl(upstream, pudl, manifests)
        if attestation:
            for profile in ("full", "docs"):
                verify_attestation(assets / record["packages"][profile]["fileName"], record)
        if output_dir:
            target = Path(output_dir)
            require(not target.exists(), "Output directory must not exist")
            target.mkdir(parents=True)
            for profile in ("full", "docs"):
                shutil.copytree(scratch / profile, target / profile)
        return {"summarySchema": 1, "version": tag, "commit": record["commit"], "recordSha256": digest, "pudl": record["pudl"],
                "packages": {profile: {"contentDigest": record["packages"][profile]["contentDigest"], "fileCount": len(manifest["files"])}
                             for profile, manifest in zip(("full", "docs"), manifests)}, "qualifications": record["qualifications"],
                "verified": True, "trustedPinVerified": pinned_hash is not None, "attestationVerified": attestation}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--assets-dir", type=Path, required=True)
    create.add_argument("--source-root", type=Path, default=ROOT)
    create.add_argument("--tag", required=True)
    create.add_argument("--commit", required=True)
    create.add_argument("--workflow-run-url", required=True)
    check = commands.add_parser("check")
    check.add_argument("record_or_tag")
    check.add_argument("--assets-dir", type=Path)
    check.add_argument("--output-dir", type=Path)
    check.add_argument("--sha256", help="An independently pinned release-record SHA-256")
    check.add_argument("--attestation", action="store_true", help="Require GitHub provenance for the record and both ZIPs (needs a current authenticated gh CLI)")
    args = parser.parse_args()
    try:
        if args.command == "create":
            print(create_record(args.assets_dir, args.source_root, args.tag, args.commit, args.workflow_run_url))
        else:
            print(json.dumps(check_record(args.record_or_tag, args.assets_dir, args.output_dir, args.sha256, args.attestation), indent=2))
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, RuntimeError, subprocess.TimeoutExpired) as error:
        print("Release verification failed: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
