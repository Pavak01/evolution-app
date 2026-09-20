// Categories are stored/matched internally as the app's own snake_case
// identifiers (parking_tolls, home_office, ...) — mirrors
// backend/src/routes/tax.routes.ts's humanizeCategory. Nothing a person
// reads should ever show an underscore, so every place a category is
// displayed (quick-pick buttons, History, expense detail) goes through
// this first; the underlying value stored on the expense is untouched.
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  fuel: "Fuel",
  travel: "Travel",
  parking_tolls: "Parking & tolls",
  vehicle_maintenance: "Vehicle maintenance",
  phone: "Phone",
  home_office: "Home office",
  ppe: "PPE",
  accountancy: "Accountancy",
  food: "Food",
  other: "Other"
};

export function humanizeCategory(category: string): string {
  const known = CATEGORY_DISPLAY_NAMES[category.trim().toLowerCase()];
  if (known) return known;
  const spaced = category.trim().replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
