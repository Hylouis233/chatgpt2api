from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("CHATGPT2API_AUTH_KEY", "test-auth")

from services.image_session_service import (  # noqa: E402
    ImageSessionExpiredError,
    ImageSessionService,
    serialize_image_session_response,
)


class ImageSessionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.account_service = Mock()
        self.account_service.get_available_access_token.return_value = "token-1"
        self.service = ImageSessionService(self.account_service)

    @patch("services.image_session_service.generate_image_result")
    def test_create_session_persists_upstream_handles(self, generate_image_result: Mock) -> None:
        generate_image_result.return_value = {
            "created": 123,
            "data": [{"b64_json": "ZmFrZQ==", "revised_prompt": "prompt"}],
            "upstream_conversation_id": "conversation-1",
            "upstream_parent_message_id": "message-1",
        }

        session, result = self.service.create_session("prompt", "gpt-image-1")

        self.assertEqual(result["created"], 123)
        self.assertEqual(session.upstream_conversation_id, "conversation-1")
        self.assertEqual(session.upstream_parent_message_id, "message-1")
        self.account_service.mark_image_result.assert_called_once_with("token-1", success=True)

    @patch("services.image_session_service.generate_image_result")
    def test_create_turn_uses_existing_upstream_handles(self, generate_image_result: Mock) -> None:
        generate_image_result.side_effect = [
            {
                "created": 1,
                "data": [{"b64_json": "ZmFrZQ=="}],
                "upstream_conversation_id": "conversation-1",
                "upstream_parent_message_id": "message-1",
            },
            {
                "created": 2,
                "data": [{"b64_json": "YmFy"}],
                "upstream_conversation_id": "conversation-1",
                "upstream_parent_message_id": "message-2",
            },
        ]

        session, _ = self.service.create_session("first", "gpt-image-1")
        next_session, next_result = self.service.create_turn(session.session_id, "second", "gpt-image-1")

        self.assertEqual(next_result["created"], 2)
        self.assertEqual(next_session.upstream_parent_message_id, "message-2")
        self.assertEqual(generate_image_result.call_args_list[1].kwargs["conversation_id"], "conversation-1")
        self.assertEqual(generate_image_result.call_args_list[1].kwargs["parent_message_id"], "message-1")

    def test_expired_session_raises_consistent_error(self) -> None:
        self.service._sessions["expired"] = Mock(
            session_id="expired",
            access_token="token-1",
            upstream_conversation_id=None,
            upstream_parent_message_id=None,
            updated_at=0.0,
        )

        with patch("services.image_session_service.time.time", return_value=9999999999.0):
            with self.assertRaises(ImageSessionExpiredError):
                self.service.create_turn("expired", "prompt", "gpt-image-1")


class ImageSessionResponseTests(unittest.TestCase):
    def test_serialize_response_hides_upstream_handles(self) -> None:
        session = Mock(session_id="session-1", updated_at=1000.0)
        payload = serialize_image_session_response(
            session,
            {
                "created": 1000,
                "data": [{"b64_json": "ZmFrZQ=="}],
                "upstream_conversation_id": "conversation-1",
                "upstream_parent_message_id": "message-1",
            },
        )

        self.assertEqual(payload["session_id"], "session-1")
        self.assertNotIn("upstream_conversation_id", payload)
        self.assertNotIn("upstream_parent_message_id", payload)


if __name__ == "__main__":
    unittest.main()
