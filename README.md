# O(n!)

**101 doors. Each one harder than the last.**

O(n!) is a puzzle assessment from ZepheniaLabs. It begins with a few warm-up questions and finishes with cryptanalysis and deduction at the level of an entry-grade intelligence analyst. You need a browser and patience. Help from anyone else doesn't count.

### ▸ [Begin the assessment](https://seraphblume.github.io/ON/)

---

## How it works

Every door asks one question. Your answer is the key that opens the next door. You can't skip ahead, so you stay at a door until you solve it.

The difficulty curve is steep:

| Tier | Doors | What to expect |
|---|---|---|
| **I · Recruit** | 1–15 | Warm-ups. Old codes, simple patterns, and a first look under the surface. |
| **II · Trainee** | 16–35 | Classical ciphers, small logic problems, and the browser becoming part of the puzzle. |
| **III · Operative** | 36–60 | Keyed ciphers, deduction, and answers spread across more than one place. |
| **IV · Analyst** | 61–85 | Breaking ciphers without the key, reading data for what doesn't fit, and longer chains of reasoning. |
| **V · Analyst-Grade** | 86–101 | Everything at once. |

## Rules of engagement

- **No outside help.** No search engines, no AI assistants, no other people. The tools built into your own browser are allowed. They're part of the test.
- **The page isn't the whole puzzle.** From Door 8 onward you'll need a desktop browser with developer tools. Sometimes the address bar or the inspector holds what you need.
- **Code isn't for running.** Some doors show code in a language you aren't told. Trace it by hand.
- **Two hints per door.** Hints are always available, and every hint you open is recorded on your progress timeline.
- **Answers are forgiving about format.** Capital letters, spaces, punctuation and accents are ignored.

## Ranking

Players are ranked by how far they get. Ties are broken by how few hints they used. Your timeline shows every door you've opened. Green means you solved it clean, amber means you used one hint, and red means you used both.

## Your progress

- No account, no sign-up, and no analytics. You pick a callsign, and your progress stays in your browser.
- **Progress → Export** gives you a code you can use to back up your run or continue it on another device.
- The **Dossier** keeps every door you've opened and the answer you gave. Some of the later doors will expect you to remember.

## Can I just read the source?

You're welcome to try. Every door is encrypted, and only the previous door's answer can unlock the next one. This repository contains no answers, so there's nothing to find by reading ahead.

## Please don't publish spoilers

If you finish, keep the answers to yourself. Share your timeline instead.

## Running it locally

The site is fully static, but it has to be served over HTTP rather than opened as a file:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

<sub>© 2026 ZepheniaLabs</sub>
