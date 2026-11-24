import { ManagePageClient } from "./manage-page-client";

const timezones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export default function ManagePage() {
  return <ManagePageClient timezones={timezones} />;
}
