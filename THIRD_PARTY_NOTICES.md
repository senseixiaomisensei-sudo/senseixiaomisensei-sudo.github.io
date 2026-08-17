# Third-party notices

The MIT license in this repository applies to original PostPrep source code and
documentation. It does not replace licenses attached to third-party materials.

- **Font Awesome Free 6.7.2** is bundled under its upstream combined licensing:
  CC BY 4.0, SIL OFL 1.1, and MIT. See <https://fontawesome.com/license/free>.
- **Tailwind CSS 3.4.17** is a build dependency distributed under the MIT
  license.
- **Hero image** `assets/hero-postprep-original.png` was generated for this
  repository on 2026-08-12 without an external image input. It replaces the
  prior hero asset whose redistribution rights were not established.
- The optional separate `rvc-service/` adapter uses the MIT-licensed
  **rvc-python** inference wrapper
  (<https://github.com/daswer123/rvc-python>, PyPI `rvc-python` 0.1.5), which
  wraps the **Retrieval-based-Voice-Conversion-WebUI** inference code. That
  upstream repository is AGPL-3.0; an operator choosing to run it as a separate
  network service must independently meet its network-service source-disclosure
  obligations. Model weights are never bundled with this repository and may
  carry separate terms that the operator must review before mounting them.

Before publishing a release, the maintainer must confirm that every bundled
image or media asset is original, permissively licensed, or otherwise cleared
for redistribution. Do not infer asset rights from the absence of EXIF data.
