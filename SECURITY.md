# Security

Use **Security → Report a vulnerability** in the repository’s GitHub interface when private reporting is enabled. If it is unavailable and no private contact is listed, request a private reporting channel in an issue without including exploit details.

A useful private report identifies the affected file or page, reproduction steps, and likely impact. Remove credentials and personal data from logs and screenshots. Do not publish sensitive details while a private report is being assessed. Response times and support for historical versions are not guaranteed.

Do not commit tokens, passwords, private keys, authentication cookies, or private configuration. Rotate or revoke exposed credentials; removing a value from the current source does not make it safe again.

The automated local scanner detects common patterns and cannot prove that a repository contains no secrets. Review the exact publication manifest and exported files before release.
