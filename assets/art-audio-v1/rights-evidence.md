# Provenance and rights record

Created for Piulka/shov on 2026-09-09. No third-party game art, character likenesses, sampled recordings, fonts, or music were imported into this pack.

Graphics were generated with OpenAI's built-in imagegen tool. The per-image prompts and exported masters are in `generation-inputs.json` and `sources/graphics/`. Exact model version, seeds and service internals were not exposed. Hero weapon variants use the generated blade hero as reference; the needle variant required a second background-extraction pass. Masters are flattened PNGs, not layered PSD/Aseprite projects.

Terms checked on 2026-09-09:
- https://openai.com/policies/row-terms-of-use/ (effective 2026-01-01), Content / Ownership of content.
- https://openai.com/policies/terms-of-use/ (Europe terms updated 2026-01-16), Content / Ownership of content.

These terms assign OpenAI's rights in outputs to the user to the extent allowed by law. Outputs may not be unique; this record is not a guarantee of copyright protection or exclusivity. Use and distribution remain subject to applicable service terms. The pack is supplied to the repository owner for their game, not relicensed as CC0 or as a third-party asset library.

Audio is original mathematical synthesis by the assistant for this project, using the included `tools/generate-audio.py`. It uses oscillators, filtered deterministic noise and periodic layers; no external recordings, samples, voices, melodies or music models. Source code and 48 kHz / 24-bit PCM masters are supplied for modification and regeneration. NumPy/SciPy and FFmpeg are tools used to process the original signal, not sampled content sources.
