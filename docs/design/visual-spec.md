# Visual implementation specification

Concept reference: expedition-concept.png. Generated with the built-in image tool, then inspected locally. Prompt is stored in concept-prompt.txt.

World tokens: sea #c6e5e4, ink #18383a, paper #f6f4ea, orange #d5603d, sage #91b89c, gold #e0bb74, cliff #8e9f98. The later retro direction applies to interface elements, not the Three.js world materials, lighting or ocean.

Primary screen: fixed cream left expedition rail, concise current chapter summary and orange Enter island action; scrollable chapter route beneath. Right world: actual Blender models on sea, cream numbered island markers, compact Field guide/settings/sound actions at top. The user's later direction removes the decorative Build small / Think big headline and expedition subtitle from the concept. Keep titles only where they identify the selected chapter or help the player act; avoid duplicate subtitles and decorative eyebrow labels. Later refinement removes all passive chapter subtitles, save-success notes, inline help and duplicate control values; mission assumptions and landmarks are collapsed, with full explanations in the field guide.

Intentional functional deviations from generated reference: all16 labels use the verified actual chapter names, not the invented names in the image. Each island has custom parent-authored Blender geometry rather than raster art. Native 3D paths, couriers and Blender-authored human crews replace in-image glows. Crew decline and reversible chapter-specific damage make failed objectives visible. Generated inset only informs play-mode panels; it is not shipped as fake game UI. All16 chapters remain available in the rail. Mobile stacks the playable world and mission controls.

Play mode: back-to-chart header, focused enlarged chapter diorama, objectives, configuration controls, one clear traffic-trial action; results share the same panel. Landmark inspections and field notes are original teaching text. Numeric outcomes are labeled educational simulation values.

## Retro interface refinement

Requested by the user after the first playable build. References were inspected visually on October 11, 2026:

- [Ethereum landing page](https://ethereum.org/): pastel lavender/cyan illustration, precise drawn outlines, white space and black type. This informs the interface accents; its hero illustration does not replace the authored islands.
- [Gumroad dashboard on Mobbin](https://mobbin.com/screens/39bf3ec3-7772-48b7-84d0-939535a1f3db): cream content surface, a crisp divided sidebar, rectangular framed content and a pink action.
- [Gumroad storefront on Mobbin](https://mobbin.com/screens/84dc9820-e5fb-4095-85fe-025eccb1f262): rectangular outlined cards, divided rows and compact outlined controls.

Synthesis: an original retro control deck with warm ivory paper, near-black ink, lavender primary actions, mint/yellow accents, sharp 3px borders and solid offset shadows. Controls use the bundled Space Mono; chapter headings use the system Georgia serif. Pressed buttons move into their shadow. Focus, selected, disabled, failure and success states remain distinct and readable. No decorative subtitles or passive help notes are added. All DOM controls, dialogs and debrief surfaces follow the theme; the scene render retains its existing appearance.

The user's subsequent clarification strengthens the main borders to3px, with4px raised action shadows. The DOM island-number buttons also use the retro treatment; their projected positions remain controlled by Three.js.

## React motion

Explicitly requested after discussing animation options. Use the locally installed `motion` package, imported from `motion/react`, and bundle it into the portable edition. [Motion installation](https://motion.dev/docs/react-installation), [AnimatePresence](https://motion.dev/docs/react-animate-presence) and [MotionConfig](https://motion.dev/docs/react-motion-config) are the primary API references.

Chapter headings and mission panels animate on entry only, avoiding active old controls during a chapter switch. Results enter gently, with a small stagger on metric cards. The noninteractive trial banner can animate its exit. Raised React buttons animate their shadows while existing CSS handles physical presses. Native dialogs remain open through a short internal exit before closing and restoring focus. OS and game reduced-motion preferences suppress transforms and use zero animation durations. Keep input values immediate, preserve trial cancellation and native keyboard semantics, and retain the thick retro border treatment. This pass adds React interface motion; Three.js retains its existing crew, request and damage animations.
