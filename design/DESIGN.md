---
name: Legal Intake Utility
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444651'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#757682'
  outline-variant: '#c5c5d3'
  surface-tint: '#4059aa'
  primary: '#00236f'
  on-primary: '#ffffff'
  primary-container: '#1e3a8a'
  on-primary-container: '#90a8ff'
  inverse-primary: '#b6c4ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#4b1c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#6e2c00'
  on-tertiary-container: '#f39461'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164e'
  on-primary-fixed-variant: '#264191'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#ffb691'
  on-tertiary-fixed: '#341100'
  on-tertiary-fixed-variant: '#773205'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  h1:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  h2:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  value-mono:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  panel-padding: 12px
  gutter: 1px
---

## Brand & Style
The design system is engineered for high-stakes legal environments where clarity and speed are paramount. It follows a **Corporate / Modern** aesthetic with a heavy emphasis on utility and operational reliability. The visual language conveys a sense of "digital tools for professionals," prioritizing data visibility over decorative elements.

The interface utilizes a panel-based structure common in high-end Electron desktop applications. It avoids the airiness of web-based SaaS in favor of a condensed, functional layout that minimizes eye travel and maximizes information density. The emotional goal is to provide a "calm-tech" experience: a interface that feels like a quiet, reliable partner during intense legal intake sessions.

## Colors
This design system employs a restrained palette focused on hierarchy and state awareness. 

- **Primary Blue:** A deep, authoritative Navy (#1E3A8A) is reserved for primary actions, active navigation states, and brand-identifying elements. 
- **Neutral Scale:** A sophisticated range of cool grays (Slate) provides the foundation for the panel-based layout. Backgrounds use the lightest tints to reduce eye strain, while borders use mid-tones for clear containment.
- **Semantic Accents:** "Recording Red" (#DC2626) is used exclusively for active capture states, providing an unmistakable visual cue. Warning Amber (#D97706) is used for data validation or missing information alerts.
- **Success/Info:** Subtle greens and blues are used for confirmation states, ensuring they do not compete with the primary "Recording" indicator.

## Typography
This design system utilizes **Inter** for its exceptional legibility at small sizes and its neutral, systematic character.

Typography is used as a structural element. Labels for data fields should use the `label-caps` style to differentiate metadata from actual user input or case content. `body-sm` is the workhorse for data tables and intake forms, allowing for high information density without sacrificing readability. 

A monospace font-family is introduced for specific "Value" fields—such as Case IDs, timestamps, or recording durations—to ensure character alignment and a technical, precise feel.

## Layout & Spacing
The layout follows a **Fixed Grid within Fluid Panels** philosophy. The application window is divided into distinct functional zones (Sidebar, Main Intake, Utility/Metadata) separated by 1px borders rather than wide gutters.

Spacing is based on a 4px baseline. To achieve the "Electron app aesthetic," internal panel padding is kept tight (12px to 16px). Components like input fields and buttons are compact, reducing vertical height to allow more rows of data to be visible on standard laptop screens. Alignment should be strictly linear to reinforce the sense of order and reliability.

## Elevation & Depth
In this design system, depth is communicated through **Tonal Layers** and **Low-contrast Outlines** rather than traditional shadows. 

- **Surface 0 (Background):** The application canvas uses a subtle off-white or light gray.
- **Surface 1 (Panels):** Pure white panels sit on top of the background, defined by 1px neutral-gray borders.
- **Surface 2 (Overlays/Modals):** These use a very subtle, tight shadow (0px 2px 8px rgba(0,0,0,0.08)) to indicate they are temporary, but they still maintain a sharp 1px border.

Active states in navigation are indicated by background color shifts or high-contrast side-accents rather than "lifting" the element. This keeps the interface feeling "flat" and efficient.

## Shapes
The design system uses a **Soft** (4px) corner radius for most UI elements. This provides a modern touch while maintaining the professional, "square" discipline of a legal tool.

- **Inputs and Buttons:** 4px radius.
- **Panels:** May use 0px (sharp) when docked against the edge of the window, or 4px when floating.
- **Status Pills:** 12px (fully rounded) to contrast against the rigid rectangular grid of the rest of the application.

## Components
- **Buttons:** Use a compact height (32px for primary). Styles include Solid (Primary Blue), Outlined (Secondary), and Ghost (Neutral). Hover states are subtle: a 10% darken or lighten of the background.
- **Data Input:** Fields feature a subtle inset border. The label is placed above the field in `label-caps`. Focused fields receive a 1px primary blue border.
- **Status Indicators:** Small, circular dots for "Live" states (pulsing red for recording). Text-based statuses use compact "Pills" with low-saturation backgrounds (e.g., light blue background with dark blue text).
- **Navigation Tabs:** Horizontal tabs use a simple "Underline" style for the active state. Vertical sidebar tabs use a "Block" style, where the active item has a solid primary blue leading edge.
- **Containment:** Use horizontal dividers (1px) sparingly to separate logical groups within a single panel.
- **Recording Console:** A specialized component at the top or bottom of the screen with a permanent "Time Elapsed" counter in monospace and a prominent, rounded-square "Stop" button.