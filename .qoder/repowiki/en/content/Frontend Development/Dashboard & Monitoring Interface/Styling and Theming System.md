# Styling and Theming System

<cite>
**Referenced Files in This Document**
- [index.css](file://frontend/src/index.css)
- [package.json](file://frontend/package.json)
- [vite.config.ts](file://frontend/vite.config.ts)
- [App.tsx](file://frontend/src/App.tsx)
- [Dashboard.tsx](file://frontend/src/components/Dashboard.tsx)
- [PatientMonitor.tsx](file://frontend/src/components/PatientMonitor.tsx)
- [ColorGuideModal.tsx](file://frontend/src/components/ColorGuideModal.tsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the dashboard’s styling and theming architecture built with Tailwind CSS and custom CSS. It covers the color palette system (primary emerald theme, alarm-specific colors, and background gradients), responsive design patterns, dark theme implementation with glass-morphism effects, and accessibility considerations tailored for healthcare environments. Practical guidance is included for customizing the color scheme, creating themed components, implementing animations/transitions, and ensuring consistency across screen sizes.

## Project Structure
The styling pipeline is powered by Vite and Tailwind CSS v4. Tailwind is integrated via the official Vite plugin, and global styles are imported in the application entry point. The dashboard components apply Tailwind utilities alongside custom CSS classes to achieve a cohesive, accessible, and visually consistent clinical interface.

```mermaid
graph TB
Vite["Vite Build Tool<br/>vite.config.ts"] --> Plugin["Tailwind CSS Plugin<br/>@tailwindcss/vite"]
Plugin --> TW["Tailwind Runtime<br/>Tailwind v4"]
Entry["Application Entry<br/>main.tsx"] --> CSSImport["Global Styles Import<br/>index.css"]
CSSImport --> TW
Components["React Components<br/>Dashboard.tsx, PatientMonitor.tsx"] --> TW
Components --> CustomCSS["Custom Classes<br/>glass-morphism, gradients"]
```

**Diagram sources**
- [vite.config.ts:1-35](file://frontend/vite.config.ts#L1-L35)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)
- [Dashboard.tsx:108-130](file://frontend/src/components/Dashboard.tsx#L108-L130)
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)

**Section sources**
- [vite.config.ts:1-35](file://frontend/vite.config.ts#L1-L35)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)

## Core Components
- Tailwind CSS v4 integration via Vite plugin for atomic utility classes.
- Global base styles imported at the app root.
- Dark theme with glass-morphism using backdrop blur and semi-transparent backgrounds.
- Alarm-specific color system: red for critical, yellow for warnings, blue/purple for alerts, and emerald for stable.
- Responsive grid and flex utilities for adaptive layouts across breakpoints.
- Accessibility-first patterns: focus management, semantic roles, and high-contrast support.

**Section sources**
- [package.json:25-32](file://frontend/package.json#L25-L32)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)
- [Dashboard.tsx:108-130](file://frontend/src/components/Dashboard.tsx#L108-L130)
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)

## Architecture Overview
The styling architecture combines:
- Atomic utility classes from Tailwind for layout, spacing, typography, and color.
- Glass-morphism overlays for dark theme depth and readability.
- Alarm-driven color and animation classes applied conditionally based on patient state.
- Responsive breakpoints to adapt card grids and navigation elements.

```mermaid
graph TB
subgraph "Styling Layer"
TW["Tailwind Utilities<br/>colors, spacing, layout"]
Glass["Glass-Morphism Effects<br/>backdrop-blur, bg-opacity"]
Anim["Animations & Transitions<br/>pulse, hover states"]
end
subgraph "Components"
Dash["Dashboard<br/>layout, nav, grid"]
PM["PatientMonitor<br/>alarm states, vitals cards"]
CGM["ColorGuideModal<br/>palette reference"]
end
subgraph "Theme System"
Dark["Dark Theme<br/>zinc palette"]
Alarm["Alarm Colors<br/>red/yellow/blue/purple/emerald"]
Gradient["Background Gradient<br/>clinic feel"]
end
Dash --> TW
Dash --> Glass
Dash --> Anim
Dash --> Dark
Dash --> Gradient
PM --> TW
PM --> Anim
PM --> Alarm
PM --> Dark
CGM --> Alarm
CGM --> Dark
```

**Diagram sources**
- [Dashboard.tsx:108-130](file://frontend/src/components/Dashboard.tsx#L108-L130)
- [Dashboard.tsx:308-387](file://frontend/src/components/Dashboard.tsx#L308-L387)
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)
- [ColorGuideModal.tsx:57-99](file://frontend/src/components/ColorGuideModal.tsx#L57-L99)

## Detailed Component Analysis

### Dashboard Layout and Dark Theme
The dashboard establishes the base layout and dark theme foundation:
- Fixed full-viewport background image with a dark overlay and backdrop blur for a clinical atmosphere.
- Sticky header with glass-morphism using backdrop blur and semi-transparent backgrounds.
- Responsive navigation with search, filters, and status indicators.
- Main content grid with responsive Tailwind grid classes for critical, warning, and stable patients.
- Footer with backdrop blur and consistent spacing.

```mermaid
flowchart TD
Start(["Render Dashboard"]) --> BG["Apply background image<br/>overlay with backdrop blur"]
BG --> Header["Sticky header with glass-morphism<br/>backdrop-blur + semi-transparent bg"]
Header --> Nav["Navigation controls<br/>search, filters, status"]
Nav --> Main["Main content area<br/>responsive grid layout"]
Main --> Cards["Grids per alarm category<br/>critical/warning/stable"]
Cards --> Footer["Footer with backdrop blur"]
Footer --> End(["Complete render"])
```

**Diagram sources**
- [Dashboard.tsx:116-130](file://frontend/src/components/Dashboard.tsx#L116-L130)
- [Dashboard.tsx:134-306](file://frontend/src/components/Dashboard.tsx#L134-L306)
- [Dashboard.tsx:308-387](file://frontend/src/components/Dashboard.tsx#L308-L387)
- [Dashboard.tsx:389-410](file://frontend/src/components/Dashboard.tsx#L389-L410)

**Section sources**
- [Dashboard.tsx:108-130](file://frontend/src/components/Dashboard.tsx#L108-L130)
- [Dashboard.tsx:134-306](file://frontend/src/components/Dashboard.tsx#L134-L306)
- [Dashboard.tsx:308-387](file://frontend/src/components/Dashboard.tsx#L308-L387)
- [Dashboard.tsx:389-410](file://frontend/src/components/Dashboard.tsx#L389-L410)

### Patient Monitor Card Theming and Animations
Each patient monitor card applies:
- Conditional border, background, and shadow classes based on alarm level.
- Hover and pulse animations for alert states.
- Size-specific padding, spacing, and typography scaling.
- Color-coded vitals labels and badges for quick recognition.

```mermaid
classDiagram
class PatientMonitor {
+props patient : PatientData
+props size : "large"|"medium"|"small"
+alarmStyles : Record
+render() View
}
class AlarmStyles {
+none : "border + bg + backdrop-blur + shadow"
+blue : "border-blue + bg-blue + animate-pulse + shadow"
+yellow : "border-yellow + bg-yellow + animate-pulse + shadow"
+red : "border-red + bg-red + animate-pulse + shadow"
+purple : "border-purple + bg-purple + animate-pulse + shadow"
}
PatientMonitor --> AlarmStyles : "applies based on alarm.level"
```

**Diagram sources**
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)
- [PatientMonitor.tsx:108-112](file://frontend/src/components/PatientMonitor.tsx#L108-L112)

**Section sources**
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)
- [PatientMonitor.tsx:108-112](file://frontend/src/components/PatientMonitor.tsx#L108-L112)

### Responsive Design Patterns
Responsive behavior is achieved through:
- Flex utilities for navigation wrapping and alignment across breakpoints.
- Grid classes that scale number of columns per screen size (e.g., critical/warning/stable sections).
- Typography scaling and spacing adjustments using responsive modifiers.
- Breakpoint-specific container widths and padding for optimal readability.

```mermaid
flowchart TD
A["Container"] --> B{"Viewport width?"}
B --> |sm+| C["Larger paddings<br/>expanded nav"]
B --> |md+| D["More grid columns<br/>tighter gaps"]
B --> |lg+| E["Maximum grid density<br/>compact vitals"]
C --> F["Readability optimized"]
D --> F
E --> F
```

**Diagram sources**
- [Dashboard.tsx:348-352](file://frontend/src/components/Dashboard.tsx#L348-L352)
- [Dashboard.tsx:363-367](file://frontend/src/components/Dashboard.tsx#L363-L367)
- [Dashboard.tsx:378-382](file://frontend/src/components/Dashboard.tsx#L378-L382)

**Section sources**
- [Dashboard.tsx:348-352](file://frontend/src/components/Dashboard.tsx#L348-L352)
- [Dashboard.tsx:363-367](file://frontend/src/components/Dashboard.tsx#L363-L367)
- [Dashboard.tsx:378-382](file://frontend/src/components/Dashboard.tsx#L378-L382)

### Color Palette and Alarm System
The color system aligns with clinical urgency:
- Primary: emerald accents for stable and positive actions.
- Critical: red borders, backgrounds, and badges.
- Warnings: yellow/pale backgrounds with subtle pulses.
- Alerts: blue/purple variants for special conditions.
- Background: dark zinc palette with translucent overlays for depth.

```mermaid
graph LR
Stable["Stable<br/>emerald accents"] --> P1["Border + text + icons"]
Warning["Warning<br/>yellow"] --> P2["Border + bg + pulse"]
Alert["Alert<br/>blue/purple"] --> P3["Border + bg + pulse"]
Critical["Critical<br/>red"] --> P4["Border + bg + strong pulse + glow"]
Dark["Dark Theme<br/>zinc palette"] --> P5["Glass + overlay"]
P1 --> Palette["Palette Reference"]
P2 --> Palette
P3 --> Palette
P4 --> Palette
P5 --> Palette
```

**Diagram sources**
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)
- [Dashboard.tsx:192-196](file://frontend/src/components/Dashboard.tsx#L192-L196)
- [Dashboard.tsx:200-204](file://frontend/src/components/Dashboard.tsx#L200-L204)
- [Dashboard.tsx:208-212](file://frontend/src/components/Dashboard.tsx#L208-L212)
- [Dashboard.tsx:344-347](file://frontend/src/components/Dashboard.tsx#L344-L347)
- [Dashboard.tsx:359-362](file://frontend/src/components/Dashboard.tsx#L359-L362)
- [Dashboard.tsx:374-377](file://frontend/src/components/Dashboard.tsx#L374-L377)

**Section sources**
- [PatientMonitor.tsx:73-79](file://frontend/src/components/PatientMonitor.tsx#L73-L79)
- [Dashboard.tsx:192-196](file://frontend/src/components/Dashboard.tsx#L192-L196)
- [Dashboard.tsx:200-204](file://frontend/src/components/Dashboard.tsx#L200-L204)
- [Dashboard.tsx:208-212](file://frontend/src/components/Dashboard.tsx#L208-L212)
- [Dashboard.tsx:344-347](file://frontend/src/components/Dashboard.tsx#L344-L347)
- [Dashboard.tsx:359-362](file://frontend/src/components/Dashboard.tsx#L359-L362)
- [Dashboard.tsx:374-377](file://frontend/src/components/Dashboard.tsx#L374-L377)

### Accessibility Considerations
Accessibility features implemented:
- Focus management: skip link to main content with prominent focus styles.
- Sufficient contrast: zinc palette with appropriate text and background opacities.
- High-contrast mode support: rely on semantic colors and avoid relying solely on color.
- Keyboard navigation: interactive elements are focusable and operable via Enter/Space.
- ARIA attributes: live regions for connectivity status, labels for icons, and modal roles.

```mermaid
sequenceDiagram
participant U as "User"
participant D as "Dashboard"
participant M as "Modal"
U->>D : Press Tab to navigate
D-->>U : Focus ring visible on interactive elements
U->>D : Click skip link
D-->>U : Focus jumps to main content
U->>D : Open modal (e.g., ColorGuide)
D->>M : Render dialog with role="dialog"
M-->>U : Modal content focus managed
U->>M : Close via button or escape
M-->>D : Dismiss modal
```

**Diagram sources**
- [Dashboard.tsx:109-115](file://frontend/src/components/Dashboard.tsx#L109-L115)
- [ColorGuideModal.tsx:27-31](file://frontend/src/components/ColorGuideModal.tsx#L27-L31)

**Section sources**
- [Dashboard.tsx:109-115](file://frontend/src/components/Dashboard.tsx#L109-L115)
- [Dashboard.tsx:150-156](file://frontend/src/components/Dashboard.tsx#L150-L156)
- [ColorGuideModal.tsx:27-31](file://frontend/src/components/ColorGuideModal.tsx#L27-L31)

## Dependency Analysis
The styling stack depends on Tailwind CSS v4 and the Vite plugin for seamless compilation and development.

```mermaid
graph TB
Vite["Vite"] --> TWPlugin["@tailwindcss/vite"]
TWPlugin --> Tailwind["Tailwind CSS v4"]
App["App Entry<br/>main.tsx"] --> Styles["index.css"]
Styles --> Tailwind
Components["Dashboard.tsx, PatientMonitor.tsx"] --> Tailwind
```

**Diagram sources**
- [package.json:25-32](file://frontend/package.json#L25-L32)
- [vite.config.ts:1-10](file://frontend/vite.config.ts#L1-L10)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)

**Section sources**
- [package.json:25-32](file://frontend/package.json#L25-L32)
- [vite.config.ts:1-10](file://frontend/vite.config.ts#L1-L10)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)

## Performance Considerations
- Prefer Tailwind utilities over ad-hoc CSS to reduce CSS bundle size and improve maintainability.
- Use backdrop blur judiciously; it can be expensive on lower-end devices.
- Keep animation classes scoped to interactive states to minimize layout thrashing.
- Consolidate repeated color classes into reusable constants or computed styles to avoid duplication.

## Troubleshooting Guide
Common styling issues and resolutions:
- Utilities not applying: ensure Tailwind plugin is loaded in Vite and global styles are imported at the app root.
- Glass effect looks too dark: adjust background opacity and backdrop blur intensity in header/footer containers.
- Low contrast in alerts: verify sufficient color luminance and avoid reliance on color alone for conveying severity.
- Modal focus issues: confirm dialog role and focus trap behavior; ensure focus returns after closing.

**Section sources**
- [vite.config.ts:1-10](file://frontend/vite.config.ts#L1-L10)
- [index.css:1-2](file://frontend/src/index.css#L1-L2)
- [Dashboard.tsx:134-306](file://frontend/src/components/Dashboard.tsx#L134-L306)
- [ColorGuideModal.tsx:27-31](file://frontend/src/components/ColorGuideModal.tsx#L27-L31)

## Conclusion
The dashboard employs a robust, scalable styling architecture centered on Tailwind CSS and a dark, glass-morphism theme. The alarm-driven color system, responsive grid layouts, and accessibility-first patterns deliver a clear, efficient interface suited to clinical environments. By leveraging the provided patterns and guidelines, teams can consistently extend the design system while maintaining usability and performance.