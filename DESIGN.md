# KECPA editorial financial design

Reference: https://accura-financial.framer.website/. Adapt the split photographic hero, rounded section entrance, pinned service-photo sequence and restrained reveals using KECPA's original business content.

The palette remains ivory #f5f2eb, sand #eae5db, navy #102a34, ink #13272d and copper #b5542e. Peach #ed945e provides readable dark-surface accents. Playfair Display regular/italic headings and Inter reading/control text retain fluid clamp sizing, bounded containers and intrinsic grids.

Five generated illustrative photographs represent CPA review, accounting, tax preparation, advisory and bookkeeping. Generated people are not actual staff or clients. image-prompts.md records prompts. Each asset has full and 560px WebP variants.

Hero photo has bounded scroll parallax, a floating glass navigation bar, and a smooth navy gradient with a subtle 2.5% grain overlay. Desktop service photo stays pinned and crossfades with the active article; phones use inline photographs and compact spacing. Process panels pin and scale into a stack on desktop; text/card reveals run once. Native scrolling uses one event-scheduled frame, no idle loop or scroll hijacking. Layout positions are measured independently of transforms. Reduced-motion cancels reveals and removes parallax, transforms and transitions while retaining service/photo correspondence.

Original five services, three process steps, business copy, contacts, legal links and Formspree endpoint remain. No reference testimonials or invented performance metrics are added. Mobile menu supports keyboard dismissal. Visible focus, 44px touch targets, labelled fields, 16px phone inputs and refresh-to-top remain.

Public WebP assets are explicitly allowlisted. Internal docs and QA outputs remain excluded. No new runtime dependency or CSP relaxation. User authorized pushing the completed redesign to GitHub main. Browser evidence covers 17 widths using Edge emulation, not physical iPhone/Safari.
