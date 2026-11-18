# O(n!) — a ZepheniaLabs assessment

101 doors. Each one is harder than the last, from simple letter games up to analyst-grade cryptanalysis and deduction.

- The answer to each door is the key to the next. There is no skipping ahead.
- No outside help: no search engines, no AI assistants, no other people. The tools built into your own browser count as part of the test.
- From Door 8 onward you'll need a desktop browser with developer tools. The address bar and the inspector may hold what you need.
- Code snippets are written in an undisclosed language. Don't run them; trace them by hand.
- You get two hints per door. Every hint you open is recorded on your progress timeline.
- Ranking is by the furthest door reached, then by the fewest hints used.

Progress is saved in your browser. Use **Progress → Export** to back it up or move to another device.

## A note for the curious

Every door is encrypted, and only the previous door's answer can decrypt the next one. Reading this repository's source won't tell you any answer, and it won't let you skip a door.

---

### Hosting (GitHub Pages)

1. Push these files to the root of the repository's default branch.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Pick the default branch and the `/ (root)` folder.
3. The site is served at `https://<user>.github.io/<repo>/`. No build step is needed. The `.nojekyll` file tells Pages to serve the files exactly as they are.

© ZepheniaLabs
