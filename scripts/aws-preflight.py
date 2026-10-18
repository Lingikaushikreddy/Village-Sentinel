#!/usr/bin/env python3
"""Read account/model metadata. Never provision resources or invoke a model."""
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--instance-role", action="store_true", help="allow IMDS credential discovery on an approved EC2 host")
    args = parser.parse_args()
    if not args.instance_role:
        os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    result = {"status": "needs-local-aws-login", "modelInvoked": False, "resourcesCreated": False, "inferenceVerified": False, "region": args.region}
    try:
        import boto3
        from botocore.config import Config
        session = boto3.Session(profile_name=args.profile, region_name=args.region)
        if session.get_credentials() is None:
            result["next"] = "Complete AWS signup and configure local CLI authentication. Do not paste access keys into chat."
            print(json.dumps(result, indent=2))
            return 2
        config = Config(connect_timeout=3, read_timeout=5, retries={"total_max_attempts": 1})
        session.client("sts", config=config).get_caller_identity()
        result["status"] = "account-authenticated-inference-unverified"
        model = os.environ.get("SENTINEL_BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
        result["modelId"] = model
        if model.startswith(("us.", "eu.", "apac.", "global.")):
            profile = session.client("bedrock", config=config).get_inference_profile(inferenceProfileIdentifier=model)
            result["profileStatus"] = profile.get("status", "unknown")
            result["destinationModels"] = [row["modelArn"].split("/")[-1] for row in profile.get("models", [])]
        result["next"] = "Review account pricing, permissions and the resource proposal before a separately authorized bounded model invocation."
        print(json.dumps(result, indent=2))
        return 0
    except ImportError:
        result["status"] = "needs-bedrock-dependencies"
        result["next"] = "Install sentinel[bedrock,test] in the project virtual environment."
    except Exception as exc:
        # Provider exception messages may contain account identifiers; report the type only.
        result["errorType"] = type(exc).__name__
        result["next"] = "Check the local AWS login, selected profile, region and metadata permissions. No model was invoked."
    print(json.dumps(result, indent=2))
    return 2


if __name__ == "__main__":
    sys.exit(main())
