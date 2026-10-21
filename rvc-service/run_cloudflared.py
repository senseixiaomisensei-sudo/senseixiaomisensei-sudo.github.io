"""Run cloudflared headlessly with native, immediately visible log handles."""
import argparse
import os
from pathlib import Path
import subprocess


def run(executable, origin, protocol, registration, log_path):
    command = [str(executable), 'tunnel', '--url', origin, '--no-autoupdate',
               '--protocol', protocol, '--quick-service', registration]
    env = {key: value for key, value in os.environ.items()
           if key.lower() not in ('http_proxy', 'https_proxy', 'all_proxy', 'ftp_proxy')}
    env['NO_PROXY'] = '*'
    # Creating a new hidden console fails DLL initialization in S4U/session 0.
    # CREATE_NO_WINDOW avoids that console; direct file handles avoid PowerShell
    # buffering the registration URL until the long-lived process exits.
    with Path(log_path).open('wb', buffering=0) as stdout, Path(str(log_path)+'.err').open('wb', buffering=0) as stderr:
        result = subprocess.run(command, env=env, stdout=stdout, stderr=stderr,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=False)
    return result.returncode


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable', required=True)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--protocol', choices=['http2', 'quic', 'auto'], required=True)
    parser.add_argument('--registration', required=True)
    parser.add_argument('--log-path', required=True)
    args = parser.parse_args()
    raise SystemExit(run(args.executable, args.origin, args.protocol, args.registration, args.log_path))
