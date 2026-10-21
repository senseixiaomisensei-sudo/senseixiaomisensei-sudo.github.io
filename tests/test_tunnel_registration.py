import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
import quick_tunnel_registration as registration


class DirectRegistrationTests(unittest.TestCase):
    def session(self, *, status=200, error=None):
        session = MagicMock()
        session.__enter__.return_value = session
        if error:
            session.post.side_effect = error
        else:
            session.post.return_value.status_code = status
        return session

    def test_success_never_uses_environment_or_windows_registry_proxy(self):
        session = self.session()
        with patch.object(registration.requests, 'Session', return_value=session):
            response = registration.request_tunnel()
        self.assertEqual(response.status_code, 200)
        self.assertIs(session.trust_env, False)
        session.post.assert_called_once_with('https://api.trycloudflare.com/tunnel', timeout=(5, 15))

    def test_retry_is_direct_and_bounded(self):
        sessions = [self.session(error=registration.requests.ConnectionError('offline')), self.session()]
        with patch.object(registration.requests, 'Session', side_effect=sessions) as factory:
            self.assertEqual(registration.request_tunnel().status_code, 200)
        self.assertEqual(factory.call_count, 2)
        self.assertTrue(all(session.trust_env is False for session in sessions))

    def test_outage_does_not_fall_back_to_a_desktop_vpn(self):
        sessions = [self.session(status=503), self.session(status=503)]
        with patch.object(registration.requests, 'Session', side_effect=sessions) as factory:
            self.assertIsNone(registration.request_tunnel())
        self.assertEqual(factory.call_count, 2)
        self.assertTrue(all(session.trust_env is False for session in sessions))


if __name__ == '__main__':
    unittest.main()
