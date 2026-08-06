"""Tests for the ``octogen-url-lists`` CLI."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx
from octogen_ai_sdk import _url_lists_cli as cli

BASE_URL = "https://api.octogen.ai/v1"
LIST_ID = "cul_01HZY3WQ8K4V9P2M5X7R00AA"
AUTH = ["--api-key", "key"]

ACTIVE_LIST = {
    "urlListId": LIST_ID,
    "name": "q3-campaign",
    "status": "active",
    "urlCount": 2,
    "bigQuery": {
        "exchangeId": "catalogs_prod",
        "listingId": f"coverage_{LIST_ID}_v1",
        "sharedDatasetId": f"coverage_share_{LIST_ID}_v1",
        "viewId": "products_current_v1",
        "lastExportedAt": "2026-08-06T06:30:00Z",
        "lastRowCount": 1128,
        "readerCount": 1,
    },
    "createdAt": "2026-08-05T12:00:00Z",
    "updatedAt": "2026-08-06T06:30:00Z",
}
PROVISIONING_LIST = {
    **ACTIVE_LIST,
    "status": "provisioning",
    "urlCount": 0,
    "bigQuery": None,
}


def _mutation_response(
    *, accepted: int = 1, rejected: list[dict[str, str]] | None = None, count: int = 2
) -> dict[str, object]:
    return {
        "accepted": [
            {
                "url": f"https://a.example/p/{i}",
                "normalizedUrl": f"https://a.example/p/{i}",
            }
            for i in range(accepted)
        ],
        "rejected": rejected or [],
        "urlCount": count,
        "requestId": "req-1",
    }


class TestCreate:
    def test_dry_run_makes_no_request(self, capsys: pytest.CaptureFixture[str]) -> None:
        with respx.mock:
            route = respx.post(f"{BASE_URL}/coverage/url-lists")
            rc = cli.main(["create", "--name", "q3-campaign", *AUTH])
        assert rc == 0
        assert not route.called
        assert "DRY RUN" in capsys.readouterr().out

    @respx.mock
    def test_apply_creates_and_reports(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        route = respx.post(f"{BASE_URL}/coverage/url-lists").mock(
            return_value=httpx.Response(201, json=PROVISIONING_LIST)
        )
        rc = cli.main(["create", "--name", "q3-campaign", "--apply", *AUTH])
        assert rc == 0
        assert json.loads(route.calls.last.request.read()) == {"name": "q3-campaign"}
        out = capsys.readouterr().out
        assert LIST_ID in out
        assert "provisioning (not ready yet)" in out

    @respx.mock
    def test_apply_json_payload(self, capsys: pytest.CaptureFixture[str]) -> None:
        respx.post(f"{BASE_URL}/coverage/url-lists").mock(
            return_value=httpx.Response(201, json=PROVISIONING_LIST)
        )
        rc = cli.main(["create", "--name", "q3", "--apply", "--json", *AUTH])
        assert rc == 0
        data = json.loads(capsys.readouterr().out)
        assert data["applied"] is True
        assert data["urlListId"] == LIST_ID

    def test_blank_name_is_a_usage_error(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        rc = cli.main(["create", "--name", "   ", "--apply", *AUTH])
        assert rc == 2
        assert "--name must be" in capsys.readouterr().err


class TestReads:
    @respx.mock
    def test_list_follows_pagination(self, capsys: pytest.CaptureFixture[str]) -> None:
        pages = [
            httpx.Response(200, json={"items": [ACTIVE_LIST], "nextCursor": "c2"}),
            httpx.Response(
                200, json={"items": [PROVISIONING_LIST], "nextCursor": None}
            ),
        ]
        respx.get(f"{BASE_URL}/coverage/url-lists").mock(side_effect=pages)
        rc = cli.main(["list", "--json", *AUTH])
        assert rc == 0
        assert len(json.loads(capsys.readouterr().out)["items"]) == 2

    @respx.mock
    def test_get_prints_bigquery_block(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(200, json=ACTIVE_LIST)
        )
        rc = cli.main(["get", LIST_ID, *AUTH])
        assert rc == 0
        out = capsys.readouterr().out
        assert "catalogs_prod/coverage_" in out
        assert "products_current_v1" in out
        assert "1128 rows" in out

    @respx.mock
    def test_urls_stops_at_limit(self, capsys: pytest.CaptureFixture[str]) -> None:
        entry = {
            "url": "https://a.example/p/1?utm_source=x",
            "normalizedUrl": "https://a.example/p/1",
            "addedAt": "2026-08-05T12:00:00Z",
        }
        route = respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
            return_value=httpx.Response(
                200, json={"items": [entry, entry], "nextCursor": "more"}
            )
        )
        rc = cli.main(["urls", LIST_ID, "--limit", "1", *AUTH])
        assert rc == 0
        # Stops on the first page instead of chasing nextCursor.
        assert route.call_count == 1
        assert capsys.readouterr().out.strip() == "https://a.example/p/1"


class TestUrlInput:
    def test_file_skips_comments_blanks_and_exact_duplicates(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / "urls.txt"
        path.write_text(
            "\n".join(
                [
                    "# a comment",
                    "",
                    "https://a.example/p/1",
                    "  https://a.example/p/2  ",
                    "https://a.example/p/1",
                ]
            ),
            encoding="utf-8",
        )
        assert cli._load_urls(file=str(path), inline=[]) == [
            "https://a.example/p/1",
            "https://a.example/p/2",
        ]

    def test_missing_input_is_a_usage_error(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        rc = cli.main(["add-urls", LIST_ID, "--apply", *AUTH])
        assert rc == 2
        assert "no URLs given" in capsys.readouterr().err

    def test_unreadable_file_is_a_usage_error(
        self, capsys: pytest.CaptureFixture[str], tmp_path: Path
    ) -> None:
        rc = cli.main(
            [
                "add-urls",
                LIST_ID,
                "--file",
                str(tmp_path / "nope.txt"),
                "--apply",
                *AUTH,
            ]
        )
        assert rc == 2
        assert "cannot read" in capsys.readouterr().err

    def test_batches_at_the_request_cap(self) -> None:
        batches = cli._batched(
            [f"u{i}" for i in range(2_500)], cli.MAX_URLS_PER_REQUEST
        )
        assert [len(batch) for batch in batches] == [1000, 1000, 500]


class TestMutations:
    def test_add_dry_run_makes_no_request(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        with respx.mock:
            route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls")
            rc = cli.main(
                ["add-urls", LIST_ID, "--url", "https://a.example/p/1", *AUTH]
            )
        assert rc == 0
        assert not route.called
        assert "DRY RUN" in capsys.readouterr().out

    @respx.mock
    def test_add_splits_oversized_input_into_requests(self) -> None:
        route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
            return_value=httpx.Response(200, json=_mutation_response())
        )
        urls = [f"--url=https://a.example/p/{i}" for i in range(1_001)]
        rc = cli.main(["add-urls", LIST_ID, "--apply", *urls, *AUTH])
        assert rc == 0
        assert route.call_count == 2
        assert len(json.loads(route.calls[0].request.read())["urls"]) == 1000
        assert len(json.loads(route.calls[1].request.read())["urls"]) == 1

    @respx.mock
    def test_rejected_urls_exit_partial(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls").mock(
            return_value=httpx.Response(
                200,
                json=_mutation_response(
                    rejected=[
                        {
                            "url": "not-a-url",
                            "code": "invalid_url",
                            "message": "bad",
                        }
                    ]
                ),
            )
        )
        rc = cli.main(["add-urls", LIST_ID, "--url", "not-a-url", "--apply", *AUTH])
        assert rc == cli.EXIT_PARTIAL
        assert "invalid_url: not-a-url" in capsys.readouterr().out

    @respx.mock
    def test_remove_targets_the_remove_route(self) -> None:
        route = respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls/remove").mock(
            return_value=httpx.Response(200, json=_mutation_response(count=0))
        )
        rc = cli.main(
            ["remove-urls", LIST_ID, "--url", "https://a.example/p/1", "--apply", *AUTH]
        )
        assert rc == 0
        assert route.called

    @respx.mock
    def test_contains_needs_no_apply_and_counts_hits(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        respx.post(f"{BASE_URL}/coverage/url-lists/{LIST_ID}/urls/contains").mock(
            return_value=httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "url": "https://a.example/p/1",
                            "normalizedUrl": "https://a.example/p/1",
                            "present": True,
                            "addedAt": "2026-08-05T12:00:00Z",
                        },
                        {
                            "url": "https://a.example/p/2",
                            "normalizedUrl": "https://a.example/p/2",
                            "present": False,
                            "addedAt": None,
                        },
                    ]
                },
            )
        )
        rc = cli.main(
            [
                "contains",
                LIST_ID,
                "--url",
                "https://a.example/p/1",
                "--url",
                "https://a.example/p/2",
                *AUTH,
            ]
        )
        assert rc == 0
        assert "1/2 present" in capsys.readouterr().out


class TestDelete:
    @respx.mock
    def test_dry_run_does_not_delete(self, capsys: pytest.CaptureFixture[str]) -> None:
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(200, json=ACTIVE_LIST)
        )
        route = respx.delete(f"{BASE_URL}/coverage/url-lists/{LIST_ID}")
        rc = cli.main(["delete", LIST_ID, *AUTH])
        assert rc == 0
        assert not route.called
        assert "would permanently delete" in capsys.readouterr().out

    @respx.mock
    def test_apply_without_tty_or_yes_refuses(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """pytest's stdin is not a TTY, so an unattended --apply must refuse
        rather than silently destroy a list with no restore path."""
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(200, json=ACTIVE_LIST)
        )
        route = respx.delete(f"{BASE_URL}/coverage/url-lists/{LIST_ID}")
        rc = cli.main(["delete", LIST_ID, "--apply", *AUTH])
        assert rc == 2
        assert not route.called
        assert "pass --yes" in capsys.readouterr().err

    @respx.mock
    def test_apply_with_yes_deletes(self, capsys: pytest.CaptureFixture[str]) -> None:
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(200, json=ACTIVE_LIST)
        )
        route = respx.delete(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(
                202, json={**ACTIVE_LIST, "status": "delete_pending"}
            )
        )
        rc = cli.main(["delete", LIST_ID, "--apply", "--yes", *AUTH])
        assert rc == 0
        assert route.called
        assert "delete_pending" in capsys.readouterr().out

    @respx.mock
    def test_mistyped_confirmation_aborts(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(200, json=ACTIVE_LIST)
        )
        route = respx.delete(f"{BASE_URL}/coverage/url-lists/{LIST_ID}")
        monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: True, raising=False)
        monkeypatch.setattr("builtins.input", lambda _: "wrong-name")
        rc = cli.main(["delete", LIST_ID, "--apply", *AUTH])
        assert rc == 2
        assert not route.called
        assert "nothing was deleted" in capsys.readouterr().err


class TestErrors:
    def test_missing_api_key_is_a_usage_error(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.delenv("OCTO_API_KEY", raising=False)
        rc = cli.main(["list"])
        assert rc == 2
        assert "API key" in capsys.readouterr().err

    @respx.mock
    def test_api_error_surfaces_code_and_hint(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        respx.get(f"{BASE_URL}/coverage/url-lists/{LIST_ID}").mock(
            return_value=httpx.Response(404, json={"detail": "url_list_not_found"})
        )
        rc = cli.main(["get", LIST_ID, *AUTH])
        assert rc == 1
        err = capsys.readouterr().err
        assert "url_list_not_found (HTTP 404)" in err
        assert "No list with that id" in err

    @respx.mock
    def test_name_conflict_hint(self, capsys: pytest.CaptureFixture[str]) -> None:
        respx.post(f"{BASE_URL}/coverage/url-lists").mock(
            return_value=httpx.Response(409, json={"detail": "url_list_name_conflict"})
        )
        rc = cli.main(["create", "--name", "taken", "--apply", *AUTH])
        assert rc == 1
        assert "already uses that name" in capsys.readouterr().err
