// UK money for display: "£20,000.00", "-£147.97". Done by hand rather than
// with Intl, so it's identical on every Android/Hermes build.
export function formatGbp(amount: number): string {
  const pennies = Math.round(Math.abs(amount) * 100);
  const pounds = Math.floor(pennies / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = amount < 0 && pennies > 0 ? "-" : "";
  return `${sign}£${pounds}.${String(pennies % 100).padStart(2, "0")}`;
}
