

## Plan: Analytics Tab - Platform Name Masking and Admin User Analytics View

### Overview
This plan implements two key changes:
1. **Platform name masking for regular users** - Replace "Apollo", "A-Leads", and "Lusha" with "Platform A", "Platform B", and "Platform C" in the analytics tab for non-admin users
2. **Admin user analytics dashboard** - Add a new section in the Admin panel allowing admins to view detailed analytics for any user, with full platform names visible

---

### 1. Platform Name Masking in UsageAnalytics.tsx (For Regular Users)

**What Changes:**

Create a helper function that returns either masked or real platform names based on the user's role:

```typescript
const getPlatformNames = (isAdmin: boolean) => ({
  apollo: isAdmin ? "Apollo" : "Platform A",
  aleads: isAdmin ? "A-Leads" : "Platform B", 
  lusha: isAdmin ? "Lusha" : "Platform C",
});
```

**Affected Areas in UsageAnalytics.tsx:**
- Summary stat cards (lines 505-530)
- Pie chart data generation (`getPieChartData` function)
- Pie chart legend (lines 591-625)
- Bar chart data keys and legend
- Period summary section (lines 711-723)

The `isAdmin` state is already available in the component, so we just need to apply the helper function throughout.

---

### 2. Admin Panel Enhancement - User Analytics Section

**Location:** `src/pages/Admin.tsx`

**UI Structure:**

Add tabs to the Admin panel to separate "User Management" (existing functionality) from "User Analytics" (new functionality):

```text
+--------------------------------------------------+
|  Admin Panel                                      |
|  [User Management] [User Analytics]               |
+--------------------------------------------------+
|                                                   |
|  User Analytics                                   |
|  +-----------------------------------------+      |
|  | Select User: [Dropdown with user list] |      |
|  +-----------------------------------------+      |
|                                                   |
|  Date Range: [Daily|Weekly|Monthly|Custom]        |
|              [Date Picker for Custom]             |
|                                                   |
|  +-----------------------------------------+      |
|  | Summary Cards                           |      |
|  | Total | Apollo | A-Leads | Lusha        |      |
|  +-----------------------------------------+      |
|                                                   |
|  +-----------------------------------------+      |
|  | Detailed Usage Table                    |      |
|  | Date | Apollo | A-Leads | Lusha | Total |      |
|  | ...  | ...    | ...     | ...   | ...   |      |
|  +-----------------------------------------+      |
|                                                   |
|  Enrichment Status:                               |
|  Used: XX / Limit: XX  [Progress Bar]             |
+--------------------------------------------------+
```

**New State Variables:**
```typescript
// Tab state
const [adminTab, setAdminTab] = useState<"management" | "analytics">("management");

// Analytics state
const [selectedUserId, setSelectedUserId] = useState<string>("");
const [userCreditData, setUserCreditData] = useState<CreditData[]>([]);
const [analyticsTimePeriod, setAnalyticsTimePeriod] = useState<"daily" | "weekly" | "monthly" | "custom">("daily");
const [analyticsDateRange, setAnalyticsDateRange] = useState<DateRange | undefined>();
const [loadingAnalytics, setLoadingAnalytics] = useState(false);
```

**New Function to Fetch User Analytics:**
```typescript
const fetchUserAnalytics = async (userId: string) => {
  setLoadingAnalytics(true);
  const { data, error } = await supabase
    .from("credit_usage")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  
  if (!error) {
    setUserCreditData(data || []);
  }
  setLoadingAnalytics(false);
};
```

**Key Components in User Analytics Tab:**

1. **User Selector Dropdown**
   - Uses the existing `users` state which contains all users
   - Displays user email and name in the dropdown

2. **Time Period Controls**
   - Similar to the main UsageAnalytics page
   - Daily, Weekly, Monthly, Custom options
   - Date range picker for custom selection

3. **Summary Cards**
   - Total credits used
   - Apollo credits (real name visible to admin)
   - A-Leads credits (real name visible to admin)
   - Lusha credits (real name visible to admin)

4. **Usage Table (Clean Data View)**
   - Table format with columns: Date, Apollo, A-Leads, Lusha, Total
   - Grouped by the selected time period
   - No fancy charts - clean tabular data for easy reading

5. **Enrichment Status Section**
   - Shows selected user's enrichment limit and usage
   - Progress bar visual indicator

---

### 3. Required Imports for Admin.tsx

Add the following new imports:
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, BarChart3 } from "lucide-react";
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
```

---

### 4. RLS Considerations

The current RLS policy on `credit_usage` table:
```sql
Policy: "Users can view their own credit usage"
USING: (auth.uid() = user_id)
```

**Issue:** Admins cannot currently read other users' credit usage data.

**Solution:** Add an admin RLS policy:
```sql
CREATE POLICY "Admins can view all credit usage"
ON public.credit_usage
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
```

---

### 5. Files to Modify

| File | Changes |
|------|---------|
| `src/pages/UsageAnalytics.tsx` | Add platform name helper function, apply to all chart data and labels |
| `src/pages/Admin.tsx` | Add tabs structure, implement User Analytics tab with dropdown, date controls, summary cards, and usage table |
| Database migration | Add admin SELECT policy to `credit_usage` table |

---

### 6. Technical Notes

- **No impact on existing functionality** - User Management tab remains unchanged
- **Performance** - User analytics data is fetched on-demand when a user is selected
- **Accessibility** - Proper labels and keyboard navigation maintained
- **Clean design** - Follows existing UI patterns in the Admin panel with Cards, Tables, and consistent styling

