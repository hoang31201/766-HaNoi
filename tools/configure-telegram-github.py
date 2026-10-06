"""Upload approved local bot settings to GitHub Secrets without logging values."""
import base64
import json
import sys
import urllib.error
import urllib.request

from nacl.public import PublicKey, SealedBox


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    settings = json.load(sys.stdin)
    repository = "hoang31201/766-HaNoi"
    opener = urllib.request.build_opener(NoRedirect)

    def request(route, method="GET", body=None):
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repository}{route}",
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={
                "Authorization": f"Bearer {settings['githubToken']}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "hanoi-766-secret-setup",
            },
        )
        try:
            with opener.open(req, timeout=30) as response:
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"GitHub secret setup rejected (HTTP {error.code}).") from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError("GitHub secret setup connection failed.") from None

    key = request("/actions/secrets/public-key")
    box = SealedBox(PublicKey(base64.b64decode(key["key"])))
    names = []
    for name, value in settings["secrets"].items():
        if value:
            encrypted = base64.b64encode(box.encrypt(str(value).encode())).decode()
            request(f"/actions/secrets/{name}", "PUT", {"encrypted_value": encrypted, "key_id": key["key_id"]})
            names.append(name)
    for name in names:
        request(f"/actions/secrets/{name}")
    print("GitHub Secrets configured and verified: " + ", ".join(names))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("GitHub secret setup failed; no credential values logged.", file=sys.stderr)
        sys.exit(1)
