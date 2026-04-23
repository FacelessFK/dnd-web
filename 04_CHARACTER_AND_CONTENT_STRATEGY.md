# Character And Content Strategy

## 1. Character Builder Strategy

### Recommendation

Build the character builder **inside the main product/monorepo**, not as a microservice.

### Why

- It depends directly on shared rules/profile/schema logic.
- It should use the same contracts as runtime validation.
- It is too early to split operational complexity.
- The project’s current stack decisions explicitly favor a modular monolith over early microservices.

## 2. Character Product Model

### Character builder

A step-by-step guided flow for creating a playable character.

### Character library

A persistent list of user-owned characters.

### Session assignment

A live session chooses one character from that library per participant.

### Runtime overlay

During play, the session mutates overlay state without mutating the whole library entry for every temporary change.

## 3. Recommended Character Builder Scope For First Product Version

The first useful builder should support:

- name,
- class,
- species/race,
- background,
- level,
- ability scores,
- HP,
- AC,
- speed,
- notes,
- portrait/token selection,
- basic derived stat preview.

It does not need full D&D encyclopedic depth at first.

## 4. Recommended Character Builder Flow

1. Choose rules profile.
2. Choose base identity (name/species/background).
3. Choose class and level.
4. Set ability scores.
5. Review derived stats.
6. Add notes/basic flavor.
7. Choose token/portrait.
8. Save to character library.

## 5. Inventory And Progression Strategy

### Recommendation

Character creation should happen in the builder.
Inventory changes and level-up changes can happen later in separate flows.

This keeps MVP narrower:

- builder = birth of the character,
- runtime = use the character,
- progression/inventory = later systems.

## 6. Map / Adventure Content Strategy

### Recommended authored content model

- Terrain tiles
- Structures
- Props
- Transition nodes
- Scene metadata
- Adventure metadata

### Recommended authoring hierarchy

- assets define visuals,
- scenes define tactical spaces,
- adventures define connected content,
- sessions instantiate live play.

## 7. Asset Strategy Recommendation

### Early recommendation

Stay 2D and lightweight.

Use:

- terrain tilesets,
- object/prop sprites,
- token portraits,
- icons/markers.

### Avoid early

- 3D model pipeline,
- skeletal character customization,
- complex rendering stack,
- asset workflows that require high art overhead before gameplay is validated.

## 8. Customization Boundaries

### Character customization

Give enough choice for identity and readability, not unlimited visual authoring.

Good MVP choices:

- portrait upload or selection,
- token frame/color,
- class icon,
- maybe a few style themes.

### Map customization

Give DMs enough to build readable tactical spaces:

- terrain palette,
- walls,
- doors,
- stairs,
- props,
- hidden flags,
- transition links.

Do not aim for an unlimited sandbox editor immediately.

## 9. Recommended Reusable Asset Metadata

Each asset should eventually support:

- asset ID,
- category,
- visual source reference,
- default footprint,
- blocks movement,
- blocks vision,
- theme/tags,
- optional interaction metadata.

## 10. Session Setup Recommendation

A DM starting a session should be able to:

1. Create session.
2. Choose rules profile.
3. Choose adventure/map content.
4. Invite/join players.
5. Review chosen player characters.
6. Assign or confirm characters.
7. Choose starting scene.
8. Place party.
9. Start play.

## 11. Why This Strategy Matters

Without a clear character/content strategy, the product risks becoming:

- backend-complete but onboarding-poor,
- runtime-correct but user-unfriendly,
- tactically strong but content-starved,
- visually ambitious but operationally weak.

This strategy keeps the next product slices grounded in actual playability.
