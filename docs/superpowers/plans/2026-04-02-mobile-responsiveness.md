# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bravoro fully usable on mobile with a bottom tab bar navigation, responsive page layouts, and "desktop recommended" banners for data-heavy pages — without changing anything on desktop (>= 768px).

**Architecture:** CSS-first approach using Tailwind `md:` breakpoint (768px). Sidebar hidden on mobile, replaced by bottom tab bar (4 tabs: Search, Results, AI Chat, More). New `MobileShell` wrapper component provides mobile header + tab bar + safe padding. Desktop layout is guaranteed unchanged because all mobile styles are base classes with `md:` overrides restoring desktop behavior.

**Tech Stack:** React 18, Tailwind CSS, shadcn/ui (Sheet component), Lucide icons, react-router-dom useLocation, existing useIsMobile() hook.

**Spec:** `docs/superpowers/specs/2026-04-02-mobile-responsiveness-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/MobileHeader.tsx` | Create | Top header bar on mobile — logo, page title, user avatar |
| `src/components/MobileTabBar.tsx` | Create | Bottom tab bar — 4 tabs + "More" sheet |
| `src/components/MobileShell.tsx` | Create | Wrapper combining MobileHeader + MobileTabBar + content padding |
| `src/components/DesktopRecommendedBanner.tsx` | Create | Dismissible "best on desktop" banner |
| `src/components/AppSidebar.tsx` | Modify | Add `hidden md:flex` to hide on mobile |
| `src/pages/Dashboard.tsx` | Modify | Responsive margins + MobileShell integration |
| `src/pages/Results.tsx` | Modify | Responsive margins + MobileShell + table overflow |
| `src/pages/Settings.tsx` | Modify | Responsive margins + MobileShell |
| `src/pages/UsageAnalytics.tsx` | Modify | Responsive margins + MobileShell |
| `src/pages/DevTools.tsx` | Modify | Responsive margins + MobileShell |
| `src/pages/Admin.tsx` | Modify | Responsive margins + MobileShell + banner |
| `src/pages/UserDatabase.tsx` | Modify | Responsive margins + MobileShell |
| `src/components/AIChatInterface.tsx` | Modify | Input bar positioning above tab bar on mobile |
| `src/pages/landing/LandingV2.tsx` | Modify | Minor mobile padding/touch-target fixes |
| `src/pages/Auth.tsx` | Modify | Responsive form layout |
| `src/pages/ResetPassword.tsx` | Modify | Responsive form layout |

---

## Sprint 1 — Foundation (Core Layout)

### Task 1: Hide Sidebar on Mobile

**Files:**
- Modify: `src/components/AppSidebar.tsx:209` (the `flex flex-col` class line)

- [ ] **Step 1: Modify the aside className**

In `src/components/AppSidebar.tsx`, line 209, change `"flex flex-col"` to `"hidden md:flex flex-col"`:

```tsx
// BEFORE (line 209):
        "flex flex-col",

// AFTER:
        "hidden md:flex flex-col",
```

This hides the sidebar entirely below 768px and shows it as flex on desktop. Zero changes to any other sidebar behavior.

- [ ] **Step 2: Verify desktop is unchanged**

Open `http://localhost:8080/dashboard` in a desktop browser. Sidebar should look and behave exactly as before. Pin/unpin, hover expand — all working.

- [ ] **Step 3: Verify mobile hides sidebar**

Open browser DevTools, toggle device toolbar to iPhone 14 (390px). The sidebar should be completely gone. Content will still have `ml-16` margin (we fix that next).

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat(mobile): hide sidebar below 768px breakpoint"
```

---

### Task 2: Fix Dashboard Margins for Mobile

**Files:**
- Modify: `src/pages/Dashboard.tsx:246-254` (main content and background effect margins)

- [ ] **Step 1: Make main content margin responsive**

In `src/pages/Dashboard.tsx`, find the main element (line ~246):

```tsx
// BEFORE:
      <main className={cn(
        "flex-1 min-w-0 min-h-screen duration-300 ease-out",
        isSidebarPinned ? "ml-56" : "ml-16"
      )}>

// AFTER:
      <main className={cn(
        "flex-1 min-w-0 min-h-screen duration-300 ease-out",
        "ml-0 md:ml-16",
        isSidebarPinned && "md:ml-56"
      )}>
```

- [ ] **Step 2: Make background effect margin responsive**

Find the fixed background overlay (line ~252):

```tsx
// BEFORE:
        <div className={cn(
          "fixed inset-0 pointer-events-none overflow-hidden duration-300 ease-out",
          isSidebarPinned ? "ml-56" : "ml-16"
        )}>

// AFTER:
        <div className={cn(
          "fixed inset-0 pointer-events-none overflow-hidden duration-300 ease-out",
          "ml-0 md:ml-16",
          isSidebarPinned && "md:ml-56"
        )}>
```

- [ ] **Step 3: Test on mobile**

DevTools mobile view: content should now fill the full width with no left margin.

- [ ] **Step 4: Test on desktop**

Desktop view: margins should behave exactly as before (ml-16 collapsed, ml-56 pinned).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(mobile): responsive margins on Dashboard content area"
```

---

### Task 3: Fix All Other Page Margins for Mobile

**Files:**
- Modify: `src/pages/Results.tsx` (line ~1890: `ml-16` and line ~1892: `ml-16`)
- Modify: `src/pages/Settings.tsx` (line ~200: `ml-16` and line ~202: `ml-16`)
- Modify: `src/pages/UsageAnalytics.tsx` (line ~401: `ml-16` and line ~403: `ml-16`)
- Modify: `src/pages/DevTools.tsx` (line ~671: `ml-16`)
- Modify: `src/pages/Admin.tsx` (line ~718: `ml-16`)
- Modify: `src/pages/UserDatabase.tsx` (line ~366: `ml-16`)

All these pages use hardcoded `ml-16`. The fix is identical for each: change `ml-16` to `ml-0 md:ml-16`.

- [ ] **Step 1: Fix Results.tsx**

```tsx
// Line ~1890 — main element:
// BEFORE: className="flex-1 ml-16 min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 min-h-screen"

// Line ~1892 — background effects:
// BEFORE: className="fixed inset-0 ml-16 pointer-events-none overflow-hidden"
// AFTER:  className="fixed inset-0 ml-0 md:ml-16 pointer-events-none overflow-hidden"
```

- [ ] **Step 2: Fix Settings.tsx**

```tsx
// Line ~200 — main wrapper:
// BEFORE: className="flex-1 ml-16 overflow-y-auto min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 overflow-y-auto min-h-screen"

// Line ~202 — background effects:
// BEFORE: className="fixed inset-0 ml-16 pointer-events-none overflow-hidden"
// AFTER:  className="fixed inset-0 ml-0 md:ml-16 pointer-events-none overflow-hidden"
```

- [ ] **Step 3: Fix UsageAnalytics.tsx**

```tsx
// Line ~401 — main element:
// BEFORE: className="flex-1 ml-16 min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 min-h-screen"

// Line ~403 — background effects:
// BEFORE: className="fixed inset-0 ml-16 pointer-events-none overflow-hidden"
// AFTER:  className="fixed inset-0 ml-0 md:ml-16 pointer-events-none overflow-hidden"
```

- [ ] **Step 4: Fix DevTools.tsx**

```tsx
// Line ~671 — main wrapper:
// BEFORE: className="flex-1 ml-16 flex flex-col h-screen overflow-hidden"
// AFTER:  className="flex-1 ml-0 md:ml-16 flex flex-col h-screen overflow-hidden"
```

- [ ] **Step 5: Fix Admin.tsx**

```tsx
// Line ~718 — main wrapper:
// BEFORE: className="flex-1 ml-16 flex h-screen overflow-hidden"
// AFTER:  className="flex-1 ml-0 md:ml-16 flex h-screen overflow-hidden"
```

- [ ] **Step 6: Fix UserDatabase.tsx**

```tsx
// Line ~366 — main element:
// BEFORE: className="flex-1 p-6 ml-16 relative z-10"
// AFTER:  className="flex-1 p-6 ml-0 md:ml-16 relative z-10"
```

- [ ] **Step 7: Spot-check all pages on mobile**

Open each page in mobile DevTools view. All should render full-width with no left gap.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Results.tsx src/pages/Settings.tsx src/pages/UsageAnalytics.tsx src/pages/DevTools.tsx src/pages/Admin.tsx src/pages/UserDatabase.tsx
git commit -m "feat(mobile): responsive margins on all sidebar pages"
```

---

### Task 4: Build MobileHeader Component

**Files:**
- Create: `src/components/MobileHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useLocation } from "react-router-dom";
import logoIcon from "@/assets/Logo_icon_final.png";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Search",
  "/results": "Results",
  "/analytics": "Analytics",
  "/database": "Database",
  "/admin": "Admin",
  "/dev-tools": "Dev Tools",
  "/settings": "Settings",
  "/contact": "Contact",
};

export function MobileHeader() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || "Bravoro";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 block md:hidden h-14 bg-sidebar-background/95 backdrop-blur-xl border-b border-sidebar-border/50 flex items-center px-4 gap-3">
      <img src={logoIcon} alt="Bravoro" className="h-7 w-7 rounded-md" />
      <span className="text-sm font-semibold text-foreground truncate">{title}</span>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MobileHeader.tsx
git commit -m "feat(mobile): add MobileHeader component"
```

---

### Task 5: Build MobileTabBar Component

**Files:**
- Create: `src/components/MobileTabBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, BarChart3, MessageSquare, MoreHorizontal, Settings, Terminal, Shield, TrendingUp } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  isAdmin?: boolean;
  isDeveloper?: boolean;
}

const TABS = [
  { icon: Search, label: "Search", path: "/dashboard" },
  { icon: BarChart3, label: "Results", path: "/results" },
  { icon: MessageSquare, label: "AI Chat", path: "/dashboard", query: "?tab=ai_staffing" },
  { icon: MoreHorizontal, label: "More", path: "__more__" },
] as const;

export function MobileTabBar({ isAdmin = false, isDeveloper = false }: MobileTabBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (tab: typeof TABS[number]) => {
    if (tab.path === "__more__") return false;
    if (tab.label === "AI Chat") {
      return location.pathname === "/dashboard" && location.search.includes("ai_staffing");
    }
    return location.pathname === tab.path;
  };

  const handleTabPress = (tab: typeof TABS[number]) => {
    if (tab.path === "__more__") {
      setMoreOpen(true);
      return;
    }
    if (tab.query) {
      navigate(tab.path + tab.query);
    } else {
      navigate(tab.path);
    }
  };

  const moreItems = [
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: TrendingUp, label: "Analytics", path: "/analytics" },
    ...(isDeveloper ? [{ icon: Terminal, label: "Dev Tools", path: "/dev-tools" }] : []),
    ...(isAdmin ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 block md:hidden bg-sidebar-background/95 backdrop-blur-xl border-t border-sidebar-border/50">
        <div className="flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <button
                key={tab.label}
                onClick={() => handleTabPress(tab)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full",
                  "transition-colors duration-200",
                  active ? "text-emerald-400" : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-sidebar-background border-sidebar-border/50">
          <SheetHeader>
            <SheetTitle className="text-foreground">More</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 mt-4 pb-4">
            {moreItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-left",
                  "transition-colors duration-200",
                  location.pathname === item.path
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-muted-foreground hover:bg-muted/30"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MobileTabBar.tsx
git commit -m "feat(mobile): add MobileTabBar with 4 tabs and More sheet"
```

---

### Task 6: Build MobileShell Wrapper

**Files:**
- Create: `src/components/MobileShell.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { MobileHeader } from "./MobileHeader";
import { MobileTabBar } from "./MobileTabBar";

interface MobileShellProps {
  children: React.ReactNode;
  isAdmin?: boolean;
  isDeveloper?: boolean;
}

export function MobileShell({ children, isAdmin, isDeveloper }: MobileShellProps) {
  return (
    <>
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={isDeveloper} />
      <div className="pt-14 pb-20 md:pt-0 md:pb-0">
        {children}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MobileShell.tsx
git commit -m "feat(mobile): add MobileShell wrapper component"
```

---

### Task 7: Integrate MobileShell into Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Import MobileShell**

Add import at top of Dashboard.tsx:

```tsx
import { MobileShell } from "@/components/MobileShell";
```

- [ ] **Step 2: Wrap main content with MobileShell**

Find the `<main>` element (after AppSidebar). Wrap the content inside main with MobileShell. The MobileShell's padding (pt-14 pb-20 on mobile, pt-0 pb-0 on desktop) needs to go on the main element:

```tsx
// AFTER the AppSidebar closing, BEFORE the <main>:
      <MobileShell
        isAdmin={isAdmin}
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
      />

// And add mobile padding to <main>:
      <main className={cn(
        "flex-1 min-w-0 min-h-screen duration-300 ease-out",
        "ml-0 pt-14 pb-20 md:pt-0 md:pb-0 md:ml-16",
        isSidebarPinned && "md:ml-56"
      )}>
```

Wait — MobileShell wraps children with padding, but Dashboard's main already has complex structure. Simpler approach: DON'T use MobileShell's children wrapper on Dashboard. Instead, render MobileHeader + MobileTabBar directly and add padding classes to the existing `<main>`:

```tsx
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// Inside the return, right after AppSidebar:
      <MobileHeader />
      <MobileTabBar
        isAdmin={isAdmin}
        isDeveloper={user?.email === "pranavshah0907@gmail.com"}
      />

// On <main>, add mobile padding:
      <main className={cn(
        "flex-1 min-w-0 min-h-screen duration-300 ease-out",
        "ml-0 pt-14 pb-20 md:pt-0 md:pb-0 md:ml-16",
        isSidebarPinned && "md:ml-56"
      )}>
```

- [ ] **Step 3: Test mobile view**

Open Dashboard on mobile DevTools: should see header at top, tab bar at bottom, content in between with no sidebar.

- [ ] **Step 4: Test desktop view**

Open Dashboard at full width: no header, no tab bar, sidebar works as before.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(mobile): integrate mobile header and tab bar into Dashboard"
```

---

### Task 8: Integrate MobileShell into All Other Pages

**Files:**
- Modify: `src/pages/Results.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/UsageAnalytics.tsx`
- Modify: `src/pages/DevTools.tsx`
- Modify: `src/pages/Admin.tsx`
- Modify: `src/pages/UserDatabase.tsx`

For each page, the pattern is identical:

1. Add imports for MobileHeader and MobileTabBar
2. Render `<MobileHeader />` and `<MobileTabBar isAdmin={isAdmin} isDeveloper={isDeveloper} />` right after `<AppSidebar ... />`
3. Add `pt-14 pb-20 md:pt-0 md:pb-0` to the main content wrapper

- [ ] **Step 1: Fix Results.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} />

// Change main className:
// BEFORE: className="flex-1 ml-0 md:ml-16 min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 min-h-screen pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 2: Fix Settings.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === DEVELOPER_EMAIL} />

// Change main wrapper className:
// BEFORE: className="flex-1 ml-0 md:ml-16 overflow-y-auto min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 overflow-y-auto min-h-screen pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 3: Fix UsageAnalytics.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={isDeveloper} />

// Change main className:
// BEFORE: className="flex-1 ml-0 md:ml-16 min-h-screen"
// AFTER:  className="flex-1 ml-0 md:ml-16 min-h-screen pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 4: Fix DevTools.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper />

// Change main wrapper className:
// BEFORE: className="flex-1 ml-0 md:ml-16 flex flex-col h-screen overflow-hidden"
// AFTER:  className="flex-1 ml-0 md:ml-16 flex flex-col h-screen overflow-hidden pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 5: Fix Admin.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} />

// Change main wrapper className:
// BEFORE: className="flex-1 ml-0 md:ml-16 flex h-screen overflow-hidden"
// AFTER:  className="flex-1 ml-0 md:ml-16 flex h-screen overflow-hidden pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 6: Fix UserDatabase.tsx**

```tsx
// Add imports:
import { MobileHeader } from "@/components/MobileHeader";
import { MobileTabBar } from "@/components/MobileTabBar";

// After <AppSidebar ... />:
      <MobileHeader />
      <MobileTabBar isAdmin={isAdmin} isDeveloper={user?.email === "pranavshah0907@gmail.com"} />

// Change main className:
// BEFORE: className="flex-1 p-6 ml-0 md:ml-16 relative z-10"
// AFTER:  className="flex-1 p-6 ml-0 md:ml-16 relative z-10 pt-14 pb-20 md:pt-0 md:pb-0"
```

- [ ] **Step 7: Test all pages on mobile and desktop**

Quick visual check on each page: mobile shows header + tab bar, desktop unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Results.tsx src/pages/Settings.tsx src/pages/UsageAnalytics.tsx src/pages/DevTools.tsx src/pages/Admin.tsx src/pages/UserDatabase.tsx
git commit -m "feat(mobile): integrate mobile header and tab bar into all pages"
```

---

## Sprint 2 — Fully Responsive Pages

### Task 9: Fix Landing Page Mobile Issues

**Files:**
- Modify: `src/pages/landing/LandingV2.tsx`

- [ ] **Step 1: Check current nav bar styling**

Read the nav/header section of LandingV2.tsx. The nav uses inline styles with fixed padding (`padding: "20px 40px"`). Make it responsive.

- [ ] **Step 2: Fix nav padding**

Find the nav container and change fixed padding to responsive:

```tsx
// BEFORE: padding: "20px 40px"
// AFTER:  padding: "12px 16px" on mobile via style={{ padding: "clamp(12px, 2vw, 20px) clamp(16px, 4vw, 40px)" }}
```

- [ ] **Step 3: Ensure touch targets are >= 44px**

Check all buttons and links. Any with height < 44px need `min-height: 44px` added.

- [ ] **Step 4: Test at 375px width**

Verify hero, features, CTA sections all render properly without horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add src/pages/landing/LandingV2.tsx
git commit -m "feat(mobile): fix landing page nav padding and touch targets"
```

---

### Task 10: Fix Auth and ResetPassword Pages

**Files:**
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/ResetPassword.tsx`

- [ ] **Step 1: Read both files and identify form containers**

Check for any fixed-width containers or non-responsive layouts.

- [ ] **Step 2: Ensure form containers are responsive**

Both auth pages should have:
- `w-full max-w-md mx-auto px-4` on the form container
- Full-width inputs on mobile
- Buttons full-width on mobile: `w-full`
- Adequate padding around the card

- [ ] **Step 3: Test at 375px**

Forms should be centered, full-width with padding, no horizontal overflow.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Auth.tsx src/pages/ResetPassword.tsx
git commit -m "feat(mobile): responsive auth page forms"
```

---

### Task 11: Make Results Page Responsive

**Files:**
- Modify: `src/pages/Results.tsx`

- [ ] **Step 1: Add overflow-x-auto to table containers**

Find any `<Table>` elements and wrap them (or their parent) in `overflow-x-auto`:

```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

- [ ] **Step 2: Make filter bar stack on mobile**

If there's a horizontal filter/search bar, add `flex-col md:flex-row` to stack on mobile:

```tsx
// BEFORE: className="flex items-center gap-4"
// AFTER:  className="flex flex-col md:flex-row items-start md:items-center gap-4"
```

- [ ] **Step 3: Ensure result cards stack properly**

Check grid layouts. If using `grid-cols-2` or similar, ensure mobile fallback:

```tsx
// Add: className="grid grid-cols-1 md:grid-cols-2 ..."
```

- [ ] **Step 4: Test at 375px**

Results list should be scrollable, detail view accessible, no content cut off.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Results.tsx
git commit -m "feat(mobile): responsive Results page layout"
```

---

### Task 12: Make AI Chat Responsive

**Files:**
- Modify: `src/components/AIChatInterface.tsx`

- [ ] **Step 1: Adjust input bar positioning**

The chat input bar is at the bottom of the component. On mobile, it needs to sit above the tab bar (which is 64px + safe area). Add responsive bottom margin:

```tsx
// Find the bottom input div (line ~654):
// BEFORE: className="shrink-0 py-4 border-t border-border/30 bg-card/30 backdrop-blur-sm"
// AFTER:  className="shrink-0 py-4 border-t border-border/30 bg-card/30 backdrop-blur-sm mb-16 md:mb-0"
```

Alternatively, since the tab bar is fixed and the chat container is flex, adding `pb-20 md:pb-0` to the chat's parent container in Dashboard.tsx may be sufficient (already done in Task 7). Check and pick the simpler approach.

- [ ] **Step 2: Ensure messages are full-width on mobile**

Check if messages have any max-width that's too large. The `max-w-4xl` container should be fine but verify padding:

```tsx
// Ensure inner padding is responsive:
// BEFORE: className="max-w-4xl mx-auto px-5"
// AFTER:  className="max-w-4xl mx-auto px-3 md:px-5"
```

- [ ] **Step 3: Test chat at 375px**

Messages should render full-width, input should be visible above tab bar, send button reachable.

- [ ] **Step 4: Commit**

```bash
git add src/components/AIChatInterface.tsx
git commit -m "feat(mobile): responsive AI Chat input and messages"
```

---

### Task 13: Make Settings Page Responsive

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Read Settings page layout**

Check the tabs and form layouts for any fixed widths or non-responsive grids.

- [ ] **Step 2: Stack form fields on mobile**

Ensure any side-by-side form fields stack on mobile:

```tsx
// BEFORE: className="grid grid-cols-2 gap-4"
// AFTER:  className="grid grid-cols-1 md:grid-cols-2 gap-4"
```

- [ ] **Step 3: Make tabs scrollable if needed**

If tab list is too wide on mobile, add `overflow-x-auto` to the TabsList container.

- [ ] **Step 4: Test at 375px**

All settings sections should be readable, forms should be usable.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(mobile): responsive Settings page layout"
```

---

### Task 14: Make Analytics and DevTools Responsive

**Files:**
- Modify: `src/pages/UsageAnalytics.tsx`
- Modify: `src/pages/DevTools.tsx`

- [ ] **Step 1: Analytics — stat cards stack on mobile**

Ensure the stat card grid uses responsive columns:

```tsx
// Ensure: className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
```

- [ ] **Step 2: Analytics — charts resize**

Recharts `ResponsiveContainer` already handles this. Verify by testing at 375px. If chart labels overflow, reduce font size on mobile.

- [ ] **Step 3: Analytics — date picker full-width**

```tsx
// Add: className="w-full md:w-auto"
```

- [ ] **Step 4: DevTools — stack panels**

DevTools likely has side-by-side panels. Stack vertically on mobile:

```tsx
// BEFORE: className="flex gap-4"
// AFTER:  className="flex flex-col md:flex-row gap-4"
```

- [ ] **Step 5: DevTools — request list scrollable**

Add `overflow-x-auto` to any wide tables or request detail panels.

- [ ] **Step 6: Test both pages at 375px**

- [ ] **Step 7: Commit**

```bash
git add src/pages/UsageAnalytics.tsx src/pages/DevTools.tsx
git commit -m "feat(mobile): responsive Analytics and DevTools pages"
```

---

## Sprint 3 — Desktop-Recommended Pages

### Task 15: Build DesktopRecommendedBanner Component

**Files:**
- Create: `src/components/DesktopRecommendedBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from "react";
import { Monitor, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface DesktopRecommendedBannerProps {
  pageKey: string;
}

export function DesktopRecommendedBanner({ pageKey }: DesktopRecommendedBannerProps) {
  const isMobile = useIsMobile();
  const storageKey = `desktop-banner-dismissed-${pageKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === "1"; }
    catch { return false; }
  });

  if (!isMobile || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey, "1"); }
    catch { /* ignore */ }
  };

  return (
    <div className="mx-3 mt-3 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
      <Monitor className="h-4 w-4 text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-emerald-400">Best on desktop</p>
        <p className="text-[11px] text-muted-foreground">This page has large tables that work better on a wider screen.</p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-emerald-500/20 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-emerald-400" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DesktopRecommendedBanner.tsx
git commit -m "feat(mobile): add DesktopRecommendedBanner component"
```

---

### Task 16: Add Banner to Desktop-Recommended Pages

**Files:**
- Modify: `src/pages/Dashboard.tsx` (for ManualForm / Bulk Search / People Enrichment views)
- Modify: `src/pages/Admin.tsx`

- [ ] **Step 1: Add banner to Dashboard for bulk/manual views**

The Dashboard renders different content based on `selectedType`. Add the banner for types that are desktop-heavy.

```tsx
import { DesktopRecommendedBanner } from "@/components/DesktopRecommendedBanner";

// Inside the main content area, before the enrichment content:
{(selectedType === "manual" || selectedType === "bulk" || selectedType === "people_enrichment") && (
  <DesktopRecommendedBanner pageKey={selectedType} />
)}
```

- [ ] **Step 2: Add banner to Admin page**

```tsx
import { DesktopRecommendedBanner } from "@/components/DesktopRecommendedBanner";

// Inside Admin's main content, at the top:
<DesktopRecommendedBanner pageKey="admin" />
```

- [ ] **Step 3: Test on mobile**

Banner should appear on these pages when viewed on mobile. Dismiss should work and persist for the session.

- [ ] **Step 4: Test on desktop**

Banner should NOT appear on any page at desktop width.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Admin.tsx
git commit -m "feat(mobile): add desktop-recommended banners to data-heavy pages"
```

---

## Sprint 4 — Polish & Verification

### Task 17: Add Overflow Wrappers for Wide Content

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx` (or its parent in Dashboard)
- Modify: `src/pages/Admin.tsx` (tables)
- Modify: `src/pages/UserDatabase.tsx` (tables)

- [ ] **Step 1: Wrap SpreadsheetGrid in overflow container**

Find where SpreadsheetGrid is rendered in Dashboard.tsx. Wrap it:

```tsx
<div className="overflow-x-auto">
  <SpreadsheetGrid ... />
</div>
```

- [ ] **Step 2: Wrap Admin tables**

Same pattern for any `<Table>` elements in Admin.tsx:

```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

- [ ] **Step 3: Wrap UserDatabase tables**

```tsx
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

- [ ] **Step 4: Test horizontal scroll on mobile**

Tables should be horizontally scrollable without breaking the page layout.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Admin.tsx src/pages/UserDatabase.tsx
git commit -m "feat(mobile): add overflow-x-auto wrappers for wide tables"
```

---

### Task 18: Final Cross-Page Testing

- [ ] **Step 1: Test all pages at 375px (iPhone SE)**

Open DevTools, set to 375x667. Navigate through:
- Landing page
- Auth page
- Dashboard (all enrichment types)
- Results
- AI Chat
- Settings
- Analytics
- DevTools
- Admin
- UserDatabase

Check for: horizontal overflow, content behind tab bar, content behind header, touch targets < 44px, text overflow/truncation.

- [ ] **Step 2: Test at 414px (iPhone 14)**

Same pass. This is the most common mobile viewport.

- [ ] **Step 3: Test at 768px (breakpoint boundary)**

At exactly 768px: sidebar should appear, mobile header and tab bar should disappear. No flash or layout jump.

- [ ] **Step 4: Test at 1024px+ (desktop)**

Full desktop pass. Everything should be identical to before any changes were made.

- [ ] **Step 5: Fix any issues found**

Address each issue found in testing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(mobile): polish and fix issues from cross-page testing"
```
