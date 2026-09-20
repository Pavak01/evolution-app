// Categories are stored/matched internally as the app's own snake_case
// identifiers (parking_tolls, home_office, ...) — mirrors
// mobile/src/utils/category.ts. Nothing a person reads should ever show
// an underscore, so every place a category is shown or interpolated into
// a message (export CSV, duplicate-detection messages, ...) goes through
// this first; the stored value on the expense itself is untouched.
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  fuel: "Fuel",
  travel: "Travel",
  parking_tolls: "Parking & tolls",
  vehicle_maintenance: "Vehicle maintenance",
  phone: "Phone",
  home_office: "Home office",
  clothing: "Clothing",
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
