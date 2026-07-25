# Guest Onboarding — Blog Source Pack

**Purpose:** everything a writer (or a blog-writing skill in another repo) needs to turn
the guest-onboarding work into a credible, well-sourced engineering/design essay. This is
**raw material + scaffolding + a vetted evidence locker**, not the finished post. Companion
engineering docs (for facts): `guest-onboarding-OVERVIEW.md`, `-DECISIONS.md`,
`-synthesis.md`, `-BUILD-NOTES.md`.

**Target format** (per the personal-site blog): plain `.md` in `src/data/posts/<slug>.md`,
react-markdown, essay voice, **footnote-style citations**, lives on build. Inline links are
the native web citation format; use footnotes for flow-breaking caveats and a short
References block (the sources below are footnote-ready).

> ⚠️ **Honesty guardrail (read first).** This is a *design-and-build* story, **not an
> A/B-results story** — the feature isn't shipped/measured yet, so there is **no conversion
> lift to claim**. The honest "result" is the shipped flow + a defined activation event
> ("second distinct param change") wired and ready to measure. Do NOT invent a metric.
> Claiming "onboarding lifted activation X%" here would be exactly the correlation-as-causation
> failure the sourcing playbook (§7) warns against.

---

## 1. The one idea (pick a spine, then delete everything that doesn't serve it)

A great post has a single thesis. Candidates, strongest first:

- **"A guest's first five minutes must produce a real thing, not a tour."** (The aha is a
  *drag that changes the art*, and eventually a real cut file — not a walkthrough.)
- **"The empty canvas is the enemy."** (Seed the starting state; the first act is *edit*, not
  *create-from-nothing*.)
- **"Onboarding isn't a tutorial you bolt on — it's the first project."** (The seed IS the
  lesson.)

Working titles: *"The empty canvas is where new users go to quit"* · *"Your first five
minutes with a laser cutter"* · *"We taught a generative-art tool to introduce itself"* ·
*"Choose your naqsheh: designing a first run that teaches by being touched."*

---

## 2. The story beats (this is the gold — a case study is a story, not a changelog)

The most shareable version tells the *reasoning*, including what we got wrong. Real beats we
can honestly tell:

1. **The cold open.** A guest lands in a browser tool that turns generative patterns into
   laser-cut files — and sees a blank-ish canvas with no idea what to do. Most creative tools
   lose people right here. (Concrete moment, not "we built onboarding.")
2. **The tension.** It's a *guest* (no account, no history) and a *creative* tool (no template
   mental-model), and the payoff is scary and physical (a real laser cut). Three ways to fail
   at once.
3. **Research, then a plan.** We studied how the best tools onboard (Figma, p5.js, Canva,
   Cricut, Glowforge) and landed on a spine: **Land → Play → Prove.**
4. **The plan got broken — on purpose.** We had an expert-UX reviewer adversarially critique
   our first synthesis. It found the real flaw: we'd optimized for a *generic* aha ("a slider
   moves art") and buried the tool's actual magic (modulation; "it's a real fab file") behind
   funnels most guests never enter. And our "wow" was *asserted, not guaranteed* — parametric
   sliders pass through ugly mud between the good spots. (This beat — "our own plan didn't
   survive contact with a skeptic" — is the trust-builder.)
5. **The fix: a seed that teaches by being touched.** Land on a *curated* seed with a
   *golden-range* hero control (every drag lands in a beautiful band), a "drag me" cue, a
   "Surprise me" shuffle for repeat wins, and the cut/engrave lens surfaced early.
6. **Fidelity mattered.** We prototyped the three starters, and the first versions *weren't the
   real patterns* — the reviewer-of-record here was the user, who caught that the prototype's
   topographic used fake noise, phyllotaxis faked its size-wave, and "recursive" was really
   just symmetry. We rebuilt them faithful to the actual engines.
7. **The honest snag (the messy part every good post needs).** The aha is "drag → the art
   morphs live" — but the render path is debounced 150ms, so a *fast continuous drag renders
   nothing until you pause*, then snaps. It *looks frozen*. The thing the whole design rests
   on had a latency bug hiding under it. (Also: shared workshop machines leaked the previous
   attendee's work back on a fast reload; and the "live modulation" we wanted shipped *static*
   first because the engine wouldn't cleanly animate it.)
8. **The payoff (honest).** A first run that lands you on something alive, gets you to "I made
   that" in one drag, and never blocks or lies — plus an activation event defined and wired to
   measure whether it works. Forward-looking, not a fake win.

---

## 3. Principle → what we built → the evidence (the essay's backbone)

Each row is a paragraph waiting to happen: state the principle, cite it, show what we did.

| Design principle | What we built | Anchor source (credibility) |
|---|---|---|
| **Time-to-value / "aha" decides retention; teach by using, not by tutorial** | Land on a live seed; one "drag me" cue → change a param → the art changes = the aha | NN/g *Product-Led Growth and UX* ("Time to value… if users do not understand the product's value quickly, they are likely to move on"); NN/g *Mobile-App Onboarding* ("users should be able to learn the interface by using it… show tips in context instead of a tutorial") |
| **Kill the empty canvas; seed the start** | Guest opens on a curated Phyllotaxis seed (never blank); other starters one tap away | NN/g *Designing Empty States* (Kate Kaplan): empty states, done right, "increase user confidence, improve system learnability, and help users get started"; Figma teardown: "the scaffolding is the starting point, not a training mode" |
| **Progressive, contextual, fire-on-first-use > front-loaded tours; always skippable** | Tips fire only when the guest reaches a surface (lens, modulation), one at a time; everything dismissable + re-openable | NN/g *Onboarding Tutorials vs. Contextual Help* (tutorials "interrupt users… users frequently skip them"; contextual help is "triggered by some signal that the user would benefit"); NN/g *Onboarding: Skip It When Possible* |
| **A head start motivates completion** (choose-your-starter as endowed progress) | "Choose your naqsheh" three-starter picker; a chosen starter is a running start, not a blank slate | **Nunes & Drèze (2006), *Journal of Consumer Research*** — endowed-progress: a pre-filled loyalty card lifted completion **19%→34%** for identical real effort. *(The one peer-reviewed number in the whole piece — use it, cite the paper.)* |
| **Defer signup until there's value to save; never lose in-progress work** | Signup deferred to export/save; guest work must survive account creation (a P0 we verify, not assume) | Duolingo teardown ("onboarding begins with the product and ends with optional account creation… signup becomes increasingly compelling as users wish to save progress"); Adobe Express loss-of-work report (the cautionary tale) |
| **De-risk the scary fabrication step** | Surface the cut/engrave lens early ("it's a real file, not a picture"), honestly; the export airlock is a fast-follow | Silhouette ("the Send panel will reflect the recommended default cut settings based on the materials selected" — software picks the scary numbers); Glowforge "Your First Print" guided flow |
| **Reliable wow, not lucky wow** (curate the range) | Each hero control clamped to a **golden band** so *every* drag looks good; deterministic landing frame | Our own design rationale (no external stat needed — this is a craft claim, label it as ours) |

---

## 4. Metaphors & reframes to carry the post

A memorable device is what gets a design post shared (Growth.Design's whole method). Ours:

- **The naqsheh and the weaver.** The app is named for the *naqsheh* — the painted grid-sheet
  a carpet designer hands the weaver. "You draw the sheet; the machine weaves it." This is the
  emotional answer to "I'm not an artist," and it's *native to the product*, not bolted on.
  (Use as metaphor/story, never as a UI noun — it collides with the app's real term "Sheet.")
- **"The empty canvas is the enemy."** Coin it; it's the post's rallying cry.
- **"The seed is the lesson."** Onboarding *is* the first project.
- **"Choose your naqsheh" = the Pokémon starter.** Three distinct personalities so every guest
  sees themselves in one; a choice, not a slate. (Also literally how we framed it.)
- **"Drag → live morph."** The p5.js-style instant-feedback loop as the unit of delight.
- **"The golden range."** The clamped band where every value is beautiful — the difference
  between a *reliable* wow and a *lucky* one.
- **The fabrication airlock.** How maker tools (Cricut/Glowforge/Easel) turn one scary
  irreversible button into a calm, reviewable sequence — the reframe for the export step.

---

## 5. The evidence locker (vetted, quote-ready, with credibility + FLAGS)

All URLs fetched and confirmed live (2026‑07‑13) unless flagged. Pull the load-bearing quote
into the prose so the point survives a dead link; snapshot each to the Wayback Machine when
citing.

**Aha / time-to-value**
- NN/g — *Product-Led Growth and UX* — https://www.nngroup.com/articles/product-led-growth-ux/ — quote: *"Time to value represents the time it takes for new users to realize the product's true value… if users do not understand the product's value quickly, they are likely to move on."* (NN/g = named researchers, dated, primary UX authority.)
- NN/g — *Mobile-App Onboarding* — https://www.nngroup.com/articles/mobile-app-onboarding/ — *"it's often more effective to train users by showing them tips in context instead of presenting them with a tutorial."*
- ⚠️ Amplitude — *Time to Value* — https://amplitude.com/blog/time-to-value-drives-user-retention — *"69% of products with strong early activation were also strong three-month retention performers."* **Vendor benchmark (2025 Product Benchmark Report), not peer-reviewed — label it as such.**

**Empty canvas / seed the start**
- NN/g — *Designing Empty States in Complex Applications* (Kate Kaplan) — https://www.nngroup.com/articles/empty-state-interface-design/ — *"Intentionally designed empty states can help increase user confidence, improve system learnability, and help users get started."*
- Figma teardown (Supademo) — https://supademo.com/user-flow-examples/figma — *"Figma drops interactive example files into the workspace on first login… The scaffolding is the starting point, not a training mode."* (Secondary teardown — fine for describing a behavior; don't hang a stat on it.)
- p5.js Web Editor — https://p5js.org/tutorials/get-started/ — boots with `setup()`/`draw()` already drawing a gray canvas, no code required. (Primary; the cleanest "live editable seed.")

**Contextual > front-loaded tours; let them skip**
- NN/g — *Onboarding Tutorials vs. Contextual Help* (Page Laubheimer) — https://www.nngroup.com/articles/onboarding-tutorials/ — tutorials *"interrupt users… they don't tend to be memorable… users frequently skip them"*; contextual help is *"triggered by some signal that the user would benefit from that information at that moment."* **(The single best citation for our whole tip strategy.)**
- NN/g — *Onboarding: Skip It When Possible* (video) — https://www.nngroup.com/videos/onboarding-skip-it-when-possible/

**Head start / endowed progress**
- **Nunes & Drèze (2006), *The Endowed Progress Effect*, Journal of Consumer Research 32(4):504–512** — https://academic.oup.com/jcr/article-abstract/32/4/504/1787425 (full text: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=991962) — car-wash loyalty study (~300 customers): blank 8-stamp card **19%** completion vs. 10-stamp card with 2 pre-filled **34%**, identical real effort. **The only hard, peer-reviewed number available — use it precisely (who/when/n).**

**Defer signup; don't lose work**
- Duolingo teardown (Appcues GoodUX) — https://goodux.appcues.com/blog/duolingo-user-onboarding — *"onboarding begins with the product and ends with optional account creation… signup becomes increasingly compelling over time as users wish to save their progress."*
- Adobe Express loss-of-work report (official Adobe community) — https://community.adobe.com/questions-329/loss-of-work-in-adobe-express-web-january-24-2026-1620375 — first-hand: ~4 hours of edits lost when changes "were not properly saved or reflected in the version history." (Primary harm report = the cautionary tale.)

**De-risk fabrication**
- Silhouette School — *Getting Started with Your First Cut* — https://www.silhouetteschoolblog.com/2016/12/silhouette-cameo-beginners-getting-started.html — *"After you pick the material from the Material List, the Send panel will reflect the recommended default cut settings."*
- Glowforge — *Your First Print* — https://glowforge.com/watch/essentials/your-first-print (⚠️ the redesign note is marketing copy — cite only as evidence a guided first-print flow exists).
- Inventables/Easel — *X-Carve Pro Beginner's Guide* — https://inventableshardwaresupport.zendesk.com/hc/en-us/articles/34146246559124-X-Carve-Pro-Beginner-s-Guide
- Cricut Help Center — https://help.cricut.com/hc/en-us (⚠️ bot-blocked to automated fetch; resolves in-browser — link the *specific* article you quote).

**Named product examples (one best URL each)**
- Figma (live editable example files) — Supademo teardown above.
- p5.js (running default sketch) — https://p5js.org/tutorials/get-started/
- Spline (build your first scene in a live editor) — https://docs.spline.design/
- Framer (start from template/AI, not blank) — https://www.framer.com/academy/lessons/build-your-first-site (skim before quoting exact wording).
- ⚠️ **Canva — dropped.** No credible *primary* onboarding-behavior source found (top hits are marketing/template pages). Don't cite a Canva marketing page as onboarding evidence; p5.js + Figma + Spline carry the point.

### 🚩 Do-not-repeat list (protect the post's credibility)
- **"Checklists/embedded lift activation +X%"** — untraceable to any study; vendor-blog folklore
  (Appcues/Userpilot/UserGuiding citing each other). For "embedded > blocking modal," lean on
  the NN/g contextual-help evidence, **not** a percentage.
- **Amplitude 69%** — vendor benchmark, label it.
- **Glowforge onboarding-update page** — marketing, not a metric.
- Any "~70% cart abandonment" temptation — if used at all, cite the **Baymard meta-analysis
  origin** (https://baymard.com/lists/cart-abandonment-rate, 70.19% across 49 studies), never a
  listicle. (Probably not needed for this post.)

---

## 6. Blog-craft cheat sheet (folded in — apply while writing)

- **Hook:** open on the concrete guest-on-a-blank-canvas moment, not "we built onboarding."
  Web readers scan (~79%); put the point near the top (NN/g *How Users Read on the Web* —
  https://www.nngroup.com/articles/how-users-read-on-the-web/). Avoid throat-clearing and
  marketese (NN/g *Concise, Scannable, Objective* — https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/, which measured **124% higher usability** for that style — a citable craft stat).
- **Arc:** Context → Tension → Decision → Result, with connective tissue; show the *reasoning
  and the rejected paths* (freeCodeCamp — https://www.freecodecamp.org/news/how-to-write-a-great-technical-blog-post-414c414b67f6/; Superpath — https://www.superpath.co/blog/how-to-write-a-case-study).
- **Voice:** first person, active, conversational; explain opinions by narrating what produced
  them; admit tradeoffs/failures (it builds trust) — Julia Evans (https://jvns.ca/blog/2023/08/07/tactics-for-writing-in-public/), Paul Graham *Writing, Briefly* (https://www.paulgraham.com/writing44.html).
- **Evidence:** weave it as story beats, not an appendix; one sharp fact beats five vague ones;
  cut anything that doesn't move the story (Stripe writing culture — https://slab.com/blog/stripe-writing-culture/).
- **Length/structure:** focused 5–10 min read; cut the first draft to ~half; a descriptive
  heading every 2–3 short paragraphs so the arc survives skimming.
- **Images are load-bearing here:** before/after screenshots + a flow diagram do work prose
  can't. (Assets available — see §8.)
- **One idea; specific beats generic; land the ending** — restate the thesis in its memorable
  form, add a forward-looking note, don't taper.

### Ready-to-fill structure template (7 beats)
1. Cold open (150–250 words): the guest's first 60 seconds on the blank canvas; end on the tension in one line.
2. Why first-run is uniquely hard here (guest + creative tool + physical/scary payoff). State the one principle.
3. What we tried and rejected (tutorial overlay vs. sample project vs. progressive disclosure) — and the reviewer who broke our first plan.
4. The decision + how it works (Land → Play → Prove) with diagram + before/after screenshots.
5. The messy part (the 150ms "frozen drag"; the shared-machine leak; static-modulation fallback) — honest.
6. Result (honest): the shipped flow + the activation event wired to measure. No invented metric.
7. Takeaway: restate the one idea; what's next.

---

## 7. Sourcing checklist (folded in — run before publishing)

1. Fact vs. opinion — label opinions/experience, don't disguise them as data.
2. Every number → a **primary** link (whoever *collected* the data), not a listicle.
3. Attribution names **who + when + n** ("Nunes & Drèze, 2006, ~300 customers"), not "studies show."
4. Register explicit: "a study found" vs. "in our experience" vs. "we hypothesize."
5. **No causation** unless it was a controlled experiment — say so; else "rose alongside."
6. Sanity-check headline stats for inflation; add the caveat the source itself gives.
7. Source carries E-E-A-T: named author, dated, institution or first-party data, methodology.
8. Canonical/permanent URL (publisher's stable page; no tracking params/aggregators).
9. Snapshot to Wayback/Perma.cc now; keep live + archive URLs with access date.
10. Quote the load-bearing sentence so the claim survives a dead link.
11. Inline links by default; footnotes for flow-breaking caveats; References block only if 4+ heavy sources.
12. "Says who?" test — if a skeptic would ask, cite; if not, don't clutter.

*(Sourcing principles from: Scribbr primary/secondary — https://www.scribbr.com/working-with-sources/primary-and-secondary-sources/; Google E-E-A-T / helpful-content — https://developers.google.com/search/docs/fundamentals/creating-helpful-content; Baymard methodology as a model of transparency — https://baymard.com/research/methodology; Pew/ABA on link rot — https://www.americanbar.org/groups/law_practice/resources/law-practice-magazine/2025/march-april-2025/how-to-avoid-link-rot/.)*

---

## 8. Assets available for the post

- **Interactive prototype** ("Choose your naqsheh" — the three faithful starters with hero
  slider, Shuffle, fabrication lens, FPS meter). Great for an embedded demo link or screen-
  captured GIFs of "drag → live morph" and the square→pentagon recursive swap.
- **Before/after screenshots** of the three seeds (organic / geometric / flowing).
- **A flow diagram** — the Land → Play → Prove ASCII flow in `guest-onboarding-OVERVIEW.md`
  §2 can be redrawn as a clean graphic.
- **Facts to draw on** (no need to re-derive): `-OVERVIEW.md` (architecture, decisions),
  `-DECISIONS.md` (the 29 decisions + rationale), `-synthesis.md` (the original research +
  the expert review that broke our first plan), `-BUILD-NOTES.md` (the honest engineering
  snags — debounce, P0-C race, static-modulation fallback).

## 9. Angles this pack supports (writer picks one)

- **The design essay:** "The empty canvas is the enemy" — research-backed argument for seeding
  the start, with our build as the worked example. (Most evergreen/shareable.)
- **The build diary:** "How we designed a first run that teaches by being touched" — the
  reasoning + the reviewer who broke the plan + the frozen-drag snag. (Most honest/relatable.)
- **The maker angle:** "Onboarding someone toward a real laser cut" — the fabrication-airlock
  reframe, Cricut/Glowforge lessons. (Most distinctive niche.)
