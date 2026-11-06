# Quiquiriqui

> An isometric **horde-survival arcade game** where a hen dresses up in everything she earns. Under **32 KB**. No libraries, no engines, no assets: everything is drawn and synthesized with code.

**Play:** _link coming soon_ · Built for **Build & Play**, the game challenge from [Build & Pitch](https://www.open2.io/build-and-pitch/play) (open2.io), Nov 4–18, 2026.

---

## Table of Contents

1. [The Challenge](#the-challenge)
2. [Game Concept](#game-concept)
3. [Design Pillars](#design-pillars)
4. [Technical Approach](#technical-approach)
5. [Getting Started](#getting-started)
6. [Roadmap](#roadmap)
7. [Rules Compliance Checklist](#rules-compliance-checklist)

---

## The Challenge

**Build & Play**: _"Vibecode the coolest arcade game. And make it hard."_ An online challenge, open worldwide.

### Rules

| # | Rule | What it means |
|---|------|---------------|
| 01 | **32 KB** | Everything the browser downloads to play the game adds up to 32 KB at most. Any files, any language. |
| 02 | **Your own code** | No libraries, frameworks or engines (no Phaser, Three.js, React…). Only what the browser ships with. |
| 03 | **Zero assets** | No images, audio or fonts. Everything is drawn and sounds through code. |
| 04 | **New repo** | Public GitHub repo created during the challenge, plus a playable link (GitHub Pages, Vercel or itch.io). |
| 05 | **Original** | No clones, no characters from other games. |
| 06 | **One per person** | One game per Open2 account. |

**Prize:** the most-voted game wins **\$50 USD** in cash. You need an Open2 account to vote. Each account gets one vote per game (your own included) and can vote for as many games as it likes.

### Timeline

| Date | Event |
|------|-------|
| **Nov 4** | Submissions open |
| **Nov 18** | Submissions close at 23:59 (Guatemala time) |
| **Nov 19** | Voting opens (after games are reviewed) |
| **Nov 21** | Winner announced at Build & Pitch |

---

## Game Concept

A lone hen in an endless sunny meadow. Predators close in from every side, wave after wave, while the day turns to rain, snow and night. Her weapons fire on their own; **you only move**. Every level-up offers three upgrades, and **every upgrade is something she wears or carries**: a pot helmet, running boots, sunglasses, a feed basket, a cape. Glance at the hen and you see your build.

Rats arrive from the first second and foxes from 0:30; snakes join at 3:00, crows at 5:00 and badgers at 7:00, and the last minute brings everything. Three predators do more than chase: the **weasel** (from 1:00) stops, blinks and lunges in a straight line; the **magpie** (from 4:00) keeps its distance, circles and throws pebbles you can dodge; the **skunk** (from 6:00) leaves a stink cloud where it falls. Now and then a predator comes as a golden **elite** (much tougher; it drops a chest and golden eggs), and from 3:00 a rare **rainbow** one cycles through every color and drops a chest of three. A **boss** (a big, tough version of a predator) comes on most minutes and drops a **chest** with one or three upgrades. Every 20 seconds a **crate** appears; broken, it leaves a magnet (pulls in every kernel), a bomb (clears the screen), food or corn. The day turns to rain, snow and night, and at 10:00 the sun comes up.

She starts with **Egg Toss** and can carry six of seven weapons and all six passives:

| Upgrade | What it does | What she wears |
|---------|--------------|----------------|
| **Egg Toss** | Lobs eggs at the nearest predator | Her eggs turn speckled, then golden |
| **Peck** | A jab up close | A steel beak |
| **Feather Darts** | Tail feathers shot behind her, so running away fights back | Blue-tipped tail feathers |
| **Corn Spray** | A fan of kernels at a random predator | A bandolier of corn |
| **Wing Gust** | Wind that hurts and shoves back everything close | A bigger wing with blue flight feathers |
| **Chick Orbit** | Chicks circle her and nip | The chicks themselves |
| **Thunder Comb** | Lightning on predators on screen | A zigzag lightning comb |
| **Running Boots** | +10% speed a level, but -5 max health | Red boots |
| **Feed Basket** | Pulls corn from farther away, +8% XP | A basket of corn on her back |
| **Pot Helmet** | Takes 10% less damage a level, but runs 4% slower | A pot on her head |
| **Sunglasses** | +15% damage a level | Dark shades |
| **Hero Cape** | +25 max health a level | A red cape |
| **Lucky Bandana** | Dodges 7% of bites a level | A dotted neckerchief |

Each item has three looks: levels 1–2, levels 3–4 (bigger or more detailed) and level 5 (golden). Two passives come with a cost (in red on the card), so a choice is a style: light boots or a heavy pot.

**Hatching.** A weapon at level 5 whose partner passive she wears **hatches** into something new: the next level-up offers a gold **HATCH!** card, and the next chest hatches it at once.

| Weapon | + Passive | Hatches into | What changes |
|--------|-----------|--------------|--------------|
| Egg Toss | Sunglasses | **Golden Omelette** | Eggs burst in a wide splash, even on a hit |
| Peck | Pot Helmet | **Iron Beak** | Jabs four foes at once and pierces armor |
| Feather Darts | Running Boots | **Quill Storm** | Twelve darts fly all around her |
| Corn Spray | Feed Basket | **Popcorn** | Kernels burst where they hit |
| Wing Gust | Hero Cape | **Whirlwind** | A huge gust every second that heals her for what it hits |
| Chick Orbit | Lucky Bandana | **Brood** | Six fierce chicks |
| Thunder Comb | Pot Helmet | **Storm Pot** | Five bolts, each jumping on to another foe |

At 0:50 a ring of rats closes in around her (break out of it!); after that, every 45 to 75 seconds, a **random event** turns the heat up for a few seconds:

| Event | What happens |
|-------|--------------|
| **HAWK!** | A hawk's shadow hunts the hen, holds still inside a closing red ring, and the hawk dives there. Four dives: keep moving. It hits predators too. |
| **STAMPEDE!** | A band of rats runs straight across the meadow at twice their speed. |
| **SURROUNDED!** | A ring of predators appears around her and closes in: rats at first, then foxes, badgers late in the day. |
| **FRENZY!** | For ten seconds the waves come three times as fast and every predator runs faster. A red frame pulses. |

Survive **10 minutes**. At dawn the rooster crows (_¡quiquiriquí!_) and the predators flee. Then choose: end the run, or **keep going** into day 2, 3, 4... where the timeline starts over with tougher, faster and more numerous predators each day, until she falls.

### Playing again and again

- **Levels never end.** Each level costs more corn than the last. Once every item is maxed, level-ups offer **boons** (more damage, speed, reach, health or fire rate, or a warm meal) with no limit.
- **Peril 0 to 5.** A dawn unlocks the next peril. Each level adds 10% predator health and bite, and **a rule of its own**, keeping the ones below it (see [Difficulty](#difficulty)). Each peril keeps its own best time.
- **Three hens.** The white hen starts with Egg Toss; the speckled hen (unlocked by your first dawn) with Peck; the black hen (a dawn at peril 2) with Feather Darts. Locked hens can be browsed on the title screen: they show with a padlock and how to unlock them, but cannot start a run.
- **Golden eggs and the shop.** Every run earns golden eggs (time, kills, dawn, peril, and elites). Spend them on five permanent upgrades, each with its own icon and five levels: Tough Hide (+20 health a level), Strong Legs (+4% speed), Sharp Eye (+8% damage), Big Crop (+0.25 reach) and Quick Learner (+8% XP). The shop is how a hen earns her first dawn.

### Difficulty

Quiquiriqui is **hard by default**: a new player usually falls between minutes 4 and 6 at peril 0, and the first dawn comes after a few runs, some shop upgrades and learning the dangers. What makes it hard:

- **Pressure from the first minute.** Foxes from 0:20, weasels from 1:00, and a ring of rats at 0:35.
- **A quota on the meadow.** Each minute sets the fewest predators that must be around the hen; below it, more are born at once. Clearing the screen fast only brings more.
- **Each predator grows at its own pace**, by the clock and never by her level, so every level-up is pure gain. Predators are born more often ahead of where she runs.

| Predator | Role | Health (+ per minute) | Bite (+ per minute) | Speed | Knockback resist | Armor |
|----------|------|-----------------------|---------------------|-------|------------------|-------|
| Rat | the swarm | 8 (+5) | 6 (+1.2) | 2.8 | | |
| Fox | the brawler | 30 (+20) | 9 (+1.5) | 3.3 | 30% | |
| Snake | the fast one | 6 (+4) | 7 (+1.2) | 4.8 | | |
| Crow | flies | 10 (+6) | 6 (+1) | 4.0 | | |
| Badger | the tank | 70 (+45) | 14 (+2) | 2.2 | 80% | 3 |
| Magpie | keeps away, throws | 14 (+6) | 7 (+1.2) | 2.8 | | |
| Weasel | lunges | 16 (+8) | 9 (+1.5) | 2.8 | 50% | |
| Skunk | stink cloud | 35 (+15) | 9 (+1.5) | 1.9 | 50% | 1 |

  The hen runs 6 tiles a second. Armor comes off every hit (at least 1 gets through, shown in grey), so small, fast hits barely scratch a badger; elites (+2) and bosses (+3) are armored and hard to push too.
- **Levels are earned.** Predators drop corn 80% of the time and each level costs more (6, 10, 14, 19, 25...), so every card counts.
- **Peril adds rules**, one per level and cumulative:

| Peril | Rule |
|-------|------|
| 1 | **MORE EVENTS**: an event every 30 to 50 s |
| 2 | **ELITES X2**: an elite every 20 to 30 s; rainbow ones from 2:00 |
| 3 | **TWO BOSSES**: every boss comes with another |
| 4 | **TWO CARDS**: level-ups offer two cards, not three |
| 5 | **NO MERCY**: a fuller meadow and faster predators |

`npm run balance` measures it: the bot plays many seeds and reports when it fell, when it was first hurt, its level at 3:00, how calm the run was and the eggs it earned; `--items` compares every item as the bot's favorite. With an empty shop at peril 0 the bot is first bitten at 0:37 and falls at about 4:00 (median of 16 seeds); with the full shop it lasts about 8:25. A hatched weapon kills 2 to 6.6 times as much as the same weapon at level 5. A person dodges better than the bot.

```mermaid
flowchart LR
  A["Move to start"] --> B["Waves of predators"]
  B --> C["Collect corn (XP)"]
  C --> D["Level up: pick 1 of 3 wearable upgrades"]
  D --> B
  B --> E["A boss every minute: drops a chest"]
  E --> B
  B --> G["Random events and elites"]
  G --> B
  B --> F["10:00, dawn: the rooster crows"]
```

### Controls

| Device | Move | Pick an upgrade |
|--------|------|-----------------|
| Keyboard | WASD or arrow keys | 1, 2, 3 |
| Mouse | Hold a button and steer from the screen center | Click a card |
| Touch | A stick opens wherever your thumb lands (works with the phone upright or sideways) | Tap a card |
| Gamepad | Left stick | (planned) |

On the title screen: **Q / E** pick a hen, **Z / C** pick a peril, **B** opens the shop (1-5 buy), **M** turns the music off and on. On a touch screen, tap either half of a row. At dawn, **1** keeps going and **2** ends the run.

The game pauses when the window loses focus.

---

## Design Pillars

1. **Nothing to learn.** Movement only: the hen fights on her own. Easy on mobile.
2. **You can see your build.** Each upgrade is a visible item on the hen, and items change look as they level up.
3. **A calm, readable meadow.** The ground is drawn in large quiet patches so the hen and the threats always stand out.
4. **Hard, arcade.** A minute-by-minute timeline of denser waves and bosses. Ten minutes, no saves, one goal: dawn.

---

## Technical Approach

The engine is reused from our own earlier prototype (see [Archive](#archive)), adapted for an open field:

- **Single `index.html`**, everything inlined.
- **320 pixels wide, as tall as the screen's shape allows** (180 on a wide screen, up to 640 on a phone held upright), scaled up with smoothing off: by whole numbers from 2× up, by a fraction on small screens so a phone is filled edge to edge.
- **2:1 isometric projection**. Input is read as a screen direction and converted to world space, so "up" always walks up the screen.
- **Endless meadow**: five flat tile types baked once, pixel by pixel so diamonds tile without seams; each cell picks its tile from a stateless hash, and only visible cells are drawn.
- **Procedural pixel sprites**: shape functions rasterized at boot with an automatic 1 px outline and a hit-flash copy. The hen is a stack of layers (items in front, her body, the cape behind) re-baked whenever her outfit changes, so one outline wraps everything she wears.
- **Our own 3×5 pixel font**, written as data in the code (five octal digits per glyph) and drawn pixel-exact with an ink outline, so text stays as crisp as the art at any scale. No font files, no system fonts.
- **Fixed 60 Hz timestep**, object pools (300 predators, 300 kernels, 96 projectiles), hitstop, screen shake and a smoothed camera.
- **Seeded gameplay randomness**: a run replays exactly from its seed, which keeps tests and the bot reproducible.
- **Data tables** for predators, the wave timeline and the upgrades, so new content is mostly data. A predator's `act` gives it a behavior (chase, keep away and shoot, lunge); events reuse the same pool with two more (run straight across, close in on a point).
- **Own parametric WebAudio synth** (tone + noise + pitch slide + ring modulation), with every effect pitched slightly differently each time and a voice per predator.
- **Original music on the same synth**: a humming voice, a galloping bass and a noise drum kit play a theme written for this game. A tiny sequencer reads one character per eighth note and schedules ahead on the audio clock; the part follows the run (day, boss, night, dawn). Effects and music share a compressor so a full horde stays clear.

### Size Budget

Only the shipped file is gated: `dist/index.html` after Terser **and** Roadroller.

| Build | Terser output | Shipped `dist/index.html` |
|-------|---------------|---------------------------|
| M0 skeleton (measured Nov 5, 2026) | 10,936 B | 6,360 B (19.4%) |
| M1 core loop (measured Nov 5, 2026) | 28,358 B | 13,426 B (41.0%) |
| M2 dress-up (measured Nov 5, 2026) | 36,099 B | 16,188 B (49.4%) |
| M3 the ten minutes (measured Nov 5, 2026) | 43,915 B | 18,784 B (57.3%) |
| Polish and phone fit (measured Nov 5, 2026) | 44,333 B | 18,944 B (57.8%) |
| Spawns on any screen and the audio pass (measured Nov 5, 2026) | 48,734 B | 20,800 B (63.5%) |
| Faster hen, snappier magnet, new hit sound (measured Nov 5, 2026) | 49,013 B | 20,878 B (63.7%) |
| Endless days, peril, hens, shop, boons (measured Nov 5, 2026) | 55,254 B | 23,347 B (71.2%) |
| Pixel font (measured Nov 5, 2026) | 56,085 B | 23,791 B (72.6%) |
| Shop icons, locked hens, special predators, elites, events (measured Nov 5, 2026) | 66,116 B | 26,954 B (82.3%) |
| Hard by default: quota, peril rules (measured Nov 5, 2026) | 66,650 B | 27,198 B (83.0%) |
| Predators by kind, passives with costs, hatching (measured Nov 5, 2026) | 68,719 B | 28,033 B (85.5%) |
| **Final target** | n/a | **≤ 32,768 bytes** |

---

## Getting Started

Requires **Node.js 18+**.

```bash
npm install         # dev-only tools (esbuild, terser, roadroller)
npm run dev         # serve src/ unminified at http://localhost:8080
npm test            # headless 60 Hz simulation tests at 5x speed
npm run playtest    # build, then headless Chrome plays at 5x with real input + screenshots
npm run build       # full build → dist/index.html (+ size and asset gate)
npm run build:fast  # Terser only → dist/fast.html, to check minified code still runs (not size-gated)
npm run size        # re-check the size of dist/index.html
```

The build **fails** if `dist/index.html` would be over **32,768 bytes** or references any external resource. A failed build leaves the previous `dist/index.html` untouched.

To measure the difficulty, `npm run balance -- --seeds 16 --peril 0 --shop 0` plays the bot on 16 seeds (`--peril 0,1,2` for several levels, `--shop 3` or `--shop 5,0,0,2,0` for shop levels). To watch a bot play at 5x, run `npm run dev` and open `http://localhost:8080/?autoplay`. The bot dodges, collects corn, picks cards and starts over after a game over. Add `&speed=N` for another speed, or `&peaceful` to walk around with no predators. The wardrobe, `http://localhost:8080/__dev/wardrobe.html`, shows every worn item at each of its looks, and the sound board, `http://localhost:8080/__dev/sounds.html`, plays every sound effect and each part of the music. The playtest needs Node 22+ and Chrome or Edge (`CHROME_PATH` to override). All test tooling is dev-only and never shipped.

---

## Roadmap

| Status | Milestone | Deliverable |
|--------|-----------|-------------|
| ✅ | **M0: Skeleton** | Endless isometric meadow, the hen walking in 8 directions, title, pause on blur, clock, tests. |
| ✅ | **M1: Core loop** | Rats and Foxes on a wave timeline (minutes 0–3, then a ramp). Three weapons (Egg Toss, Peck, Feather Darts) and three passives (Running Boots, Feed Basket, Pot Helmet). Corn XP with a magnet, level-up cards (1/2/3, click, tap), bites, game over and a saved best time. |
| ✅ | **M2: Dress-up** | Seven weapons (adds Corn Spray, Wing Gust, Chick Orbit, Thunder Comb) and six passives (adds Sunglasses, Hero Cape, Lucky Bandana). Every item drawn on the hen, with three looks as it levels; she is re-baked whenever her look changes. |
| ✅ | **M3: The 10 minutes** | A ten-minute timeline with snakes, crows and badgers; bosses with chests; crates with a magnet, a bomb or food; rain, snow and night; the dawn win at 10:00. |
| ⬜ | **M4: Polish & ship** | A performance pass, a test on real phones, and the deploy to GitHub Pages. Done so far: the outfit and rat readability pass, the phone fit, predators born all around the hen on any screen, the audio pass, replayability (steeper XP, endless boons, endless days, peril levels, three hens, the shop), the pixel font, and variety (the weasel, magpie and skunk, elites, random events). |

---

## Rules Compliance Checklist

- [ ] `dist/index.html` ≤ 32,768 bytes (enforced by `npm run build`)
- [ ] No external requests: no CDN, fonts, images or audio (enforced by `npm run build`)
- [ ] No third-party runtime code: all shipped code is written for this project
- [ ] No image, audio or font assets: everything is procedural
- [ ] Public GitHub repo created during the challenge (Nov 4–18, 2026)
- [ ] Playable link (GitHub Pages)
- [ ] Original names, characters and world

---

License: _TBD_.
