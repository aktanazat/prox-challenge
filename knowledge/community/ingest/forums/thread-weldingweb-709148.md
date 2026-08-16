<!--
Source: https://www.weldingweb.com/threads/709148 (redirects from legacy https://weldingweb.com/vbb/threads/709148-Omnipro-220-troubleshooting-help!)
Forum: WeldingWeb — General Welding Questions
Captured: 2026-08-16 via ego-browser
-->

## Omnipro 220 troubleshooting help! — stuck-at-max-amps, resolved by opening the case

- Source: https://www.weldingweb.com/threads/709148
- Started by htownnovice, Oct 24, 2020 · 9 posts

**OP [htownnovice]:** I've got an Omnipro 220 running super hot, regardless of settings. Using the auto-generated parameters for a 3/32" 6013 rod (80A) and traveling at normal speed across 1/8" steel, the rod burned right through, cutting the steel in half like a plasma cutter. I tried turning down the current to the lowest possible setting (10A) and it did exactly the same thing. Seems like there's a disconnect between the settings on the screen and the actual output of the machine... This happens with both stick and GMAW... I tried emailing Harbor Freight's customer support, but, well, it's Harbor Freight.

**[jmmorriso]:** Just a wild guess but maybe a stuck power transistor? ... It could be that there is a communication fault, you'd need a more sophisticated electronics tool kit... Had to add that if it only happens in stick and tig that may be a clue since how constant current and constant voltage would be monitored and regulated differently, still just guessing.

**[htownnovice], with a screenshot:** The '10 A' is the current turned down as low as it will go... Here we see a crazy high reading — **399 A** — even when the current to the stick is turned off. If that's what's actually flowing to the stick when I'm welding, then it's no wonder it's so hot... The question is: why is the actual current so high, when the setting is so low?

**[ronsii]:** ...go through any and all troubleshooting stuff the manual offers... try to contact vulcan not HF for any kind of machine specific help... look for any resets or 'restore to default' options... on the off chance this is some sort of software/firmware bug or glitch. [Notes an unofficial Vulcan owners' Facebook group.]

**[jmmorriso]:** I'd guess it's not sensing current then. Current sensing on the weld output from what I've seen on welders is a hall effect sensor with a big wire going through the middle. I doubt the sensor itself is bad, probably whatever drives or monitors it's output since the display is reading almost double the amps the machine is rated at.

**Resolution — htownnovice, 2 days later:** "The welder is working again, for the moment. **I opened it up and couldn't find any obvious problems. Blew out the dust (which was minimal) and put it back together again, and it's back to normal.** I was hoping to have something more useful to report in case anyone else has this problem, but oh well. Main lesson I learned: buy the freakin' extended warranty!"

> **[ronsii]** Could be just a flakey connection between boards with multiwire connections.... any time things get computerized the slightest things can mess em' up.
> **[jmmorriso]** Hey it works! That's good news, I'd call it a win. There could have been enough grinder shavings in there to bridge a couple traces and bugger up the works.
> **[Louie1961]** I had the same problem on my Synchrowave once. Turned out to be a loose plug connection to the hall device.

**Note:** the same author (htownnovice) reported this exact "stuck reading ~400A regardless of setting" failure mode again two years later in a separate, unresolved thread (WeldingWeb #715059, "Omnipro 220 not sensing current," Dec 2022 — one reply, no fix found, no ingest file since there was no real exchange). Community consensus across both is a Hall-effect current-sensor fault, and the fix that has worked at least once is opening the case, blowing out dust, and reseating board connections — i.e. a loose/dusty connector to the current-sensing circuit, not a dead board.
