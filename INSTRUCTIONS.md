# PLUVIA Agent Instructions

We are creating a PWA allowing users around Brazil to view daily/hourly weather conditions.
Our UI is clean and pure modern web project.
We must strive to create a rock-solid codebase: robust, delightful, performance-first, bug-free.
Our mission: Deliver an accessible, hyper-local, and intuitive weather tool.

## Mission
PLUVIA's core purpose is to solve real-world problems:
1. Is it raining now?
2. Will it rain in the next 1-2 hours?
3. What's the temperature right now?
4. When will it stop? (or start?)
5. Official ALERTS & ADVISORIES (INMET)

This app is NOT a weather explorer, game or dashboard.
The 3 core questions we answer:
- Is it raining now? (Yes/No)
- Will it rain soon? (Next 1-2 hours)
- When?

If these 3 questions are answered accurately, everything else is secondary.
Always remember: A catalogue with big numbers does not help when someone needs an umbrella.

## Product priorities
Priorities in order:
1. Rain accuracy
2. Latency
3. Clarity
4. Visual quality
5. Meteorologic depth
6. Battery / data

The app must feel immediate, not slow and academic.
Rain perception differs in Manaus vs São Paulo:
- Manaus: sudden, intense downpours
- São Paulo: overcast, drizzle, frontal systems
- Rio: localized convective storms
- South: cold fronts
- Northeast: seasonal droughts / coastal rains
- Midwest: convective afternoon rains

Clear weather clarity: Always say if 'LIMPID' or 'SECO'.

## Working principle
OBSERVE -> CALCULATE -> VALIDATE -> PRESENT
This is our mental model. Keep this in mind during implementation and testing.
Never present:
- Unverified calculations
- Raw numbers without context
- False precision (e.g. 23.412°C)
- Ambiguous statements
- Confusing visualizations
- Contradictory information

Prefer simple language: "Chuva fraca", "Sem chuva".
Preserve good coding architecture.
Protect the weather architecture context.

## Before implementation
Ask yourself these questions:
- Am I adding value to the user or clutter?
- Does this answer one of the 3 core questions better?
- Does it respect the weather architecture?
- Could it break for a city with different weather?

## Weather architecture
Strict coupling: 3 components/modules:
Provider -> RAW DATA -> Normalizer -> Weather snapshot -> Presentation
Provider -> RAW DATA: weather-layer -> Weather snapshot -> Presentation -> Presentation components -> Render on screen / UI

Normalize ALL raw data into weather_snapshots immediately.
Principles:
- Single source of truth: Never fetch raw data from presentation layer/components. All weather data flows through weather-data-layer.
- Never allow raw data mutations outside normalizer.
- Rejecting raw values: parse into types as early as possible on the UI.

## Meteorological integrity
Consider place of interest: Brazil
Focus: MANAUS
Manaus humidity, convection convective rain can be misunderstood.
Never present false precision: round / qualify appropriately.
Always know:
- UV index thresholds
- Air quality standards
- Rain categories
- INMET alerts levels
- Tropical rain characteristics
- Convective vs frontal rainfall

Use water vapor, precipitation component: precipitation management for the underlying source.
RULE: "Rain chance vs hourly: If consistent"
Ensure: "Rain map and radar: always match current status"
Don't show contradictory conditions.

## Hyperlocal weather and Manaus
Remember: our APP is crafted in Manaus, so tropical weather needs attention.
For example:
- In summer/wet season: afternoon convective showers from convection in isolated thunderclouds
- Microclimates
- Urban heat island
- River breeze
- Rain
- Heat

Physical condition models suitable to the city:
Integration of Manaus microclimate recognition with:
- INMET
- Satellite and radar data
- Local reports
- User and community data
- Historical context
- River/water breeze
- Convective indicators

## PLUVIA Confidence
PLUVIA score computed by atmospheric sensors confidence.
Show a simple, understandable rating:
Confidence score based on observable signals across:
- model agreement (temperature)
- current vs. recent radar alignment
- sensor network
- river proximity
- station uptime

When confidence is low/uncertain, provide a gentle note to user: "Previsão com menor precisão".

## Official alerts
Show notice of OFFICIAL government alerts for alerts, critical meteorological events.
Sources: INMET/Defesa Civil.
CRITICAL: ALERT banner in an authoritative, eminent manner.
For rain: current alerts with proactive background alerts.
Always prioritize human information above aggregated data.

## Weather visuals
BRAND PALETTE:
- Primary blue (#2f6bff)
- Deep
- Sky blue
- Liquid glass
- White
- Carbon/Dark

Crafted to convey clarity and quality.
The visual system must prioritize:
- Rain status
- Rain probability
- Temperature
- Visual hierarchy
- Contrast & readability
- Calm feel
- Fast render
- Fluid motion

Whenever possible: a clean presentation layout. Never compromise user comprehension for decoration.
The screen layout should adhere to the aspect of:
- authenticity
- meteorological rigor
- sensory feel

## UI
The user should experience absolute clarity:
- Condition
- Rain status (NOW/SOON)
- Temperature + Feels like
- Visual rain intensity gauge
- Weekly forecast
- Hourly forecast

Secondary information (user intent):
- Humidity
- Wind
- UV
- Air quality
- Pressure
- Moon/Sun cycle

All secondary data visible on third/lower screen.
Preserve clarity: First view is immediate and uncluttered.

## Performance
Ensure the dashboard loads fast. Run pure performance:
Target:
- Load time under 1.5s
- First paint under 800ms
- Smooth 60fps
- Small bundle size
- Low CPU usage
- Memory < 50MB
- Offline performance

Keep Javascript build light, clean, organized.
First screen: Immediate rendering of core weather. Everything else deferred or background load.

## Cache
Cache strategies must serve real-world needs:
Apply caching according to the characteristics of data sources.
For unstable / offline: 36h cache.
A new weather request invalidates old cache. Show notice to indicate to users that data might be stale if network is down or failed.

## Security
Respect all browser security standards.
Never expose secret credentials in code.
Always sanitize user inputs.
Validate external data types.
Rules:
- zero client-side secrets
- input sanitization on inputs
- safe DOM insertions
- robust local storage
- strict types / boundary checks

## Dependencies
No external frameworks needed:
Pure modern web stack:
- Vanilla JS (ES6+), modern CSS custom properties, semantic HTML5
- Canvas / SVG for visualizations
- Native browser APIs (Geolocation, LocalStorage, etc.)
- NO React, NO Vue, NO bundlers
- Lightweight libraries only if strictly needed

## Code quality
Rules:
- Clear naming
- Clean modular architecture
- Comments on complex logic
- Single responsibility
- Immutability where sensible
- Defensive coding
- Sensible function length

Avoid:
- Over-abstraction
- Premature optimization
- Tight coupling
- Untested assumptions
- Magic numbers
- Inconsistent formatting

## Validation
Before declaring a task completed, confirm that the system meets ALL the stated criteria:
What to check on testing:
- App
- Rain accuracy
- UI
- Cache
- Alerts
Run reproducer scripts to verify changes.
DO NOT GUESS WHEN YOU CAN TEST, AUDIT OR EXECUTE A PRODUCER.

## Roadmap
### NOW
Ensure a rock-solid core product:
- Rain accuracy
- Latency optimization
- Manaus calibration
- Core 3 questions
- Visual rain gauge
- Offline support
- INMET alerts
- Push notifications
- PWA
- City search
- Favorite cities
- Weather share card
- Skeletons
- Dark mode
- Accessibility

### NEXT
When the core is solid:
- Multiple weather models
- Hyperlocal weather insights
- Advanced precipitation
- Enhanced animations
- Micro-interactions
- Widget
- Native wrapper

### FUTURE
Deep data excellence and infrastructure scale:
- Autonomous weather station network
- ML rain prediction
- Global scale
- Public API
- Historical weather database
- Commercial applications

## Final response after coding format
- IMPLEMENTED: What changed
- QUALITY CHECKS: Validation steps and results
- FILES REVIEWED/EDITED: Precise list with paths
- METEOROLOGICAL INTEGRITY IMPACT: Confirm alignment with integrity and Manaus
- NEXT STEP: The single most important next step to take
