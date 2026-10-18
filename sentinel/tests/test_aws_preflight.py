import json
import os
import subprocess
import sys
from pathlib import Path


def test_account_preflight_without_credentials_explains_login_without_provisioning(tmp_path):
    root = Path(__file__).resolve().parents[2]
    config = tmp_path / "empty-config"
    config.write_text("")
    env = {key: value for key, value in os.environ.items() if not key.startswith("AWS_")}
    env.update(AWS_SHARED_CREDENTIALS_FILE=str(config), AWS_CONFIG_FILE=str(config), AWS_EC2_METADATA_DISABLED="true")
    run = subprocess.run([sys.executable, str(root / "scripts/aws-preflight.py")], env=env, capture_output=True, text=True, timeout=15)
    assert run.returncode == 2
    result = json.loads(run.stdout)
    assert result["status"] == "needs-local-aws-login"
    assert result["modelInvoked"] is False
    assert result["resourcesCreated"] is False
