import Link from "next/link";
import { TimesHelpNote } from "@/components/times-help-note";

/** Address-first heading shared by book and modify times views. */
export function TimesStepSummary({ address, services }: { address: string; services: string[] }) {
  return (
    <>
      <p className="text-[15px] font-medium leading-snug">{address}</p>
      {services.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {services.map((service) => (
            <li key={service} className="text-sm text-[#8e8e93]">
              {service}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Address and help note. Side by side once the shell is wide enough. */
export function TimesStepHeader({
  address,
  services,
  changeHref,
}: {
  address: string;
  services: string[];
  changeHref: string;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start lg:gap-x-12">
      <div>
        <TimesStepSummary address={address} services={services} />
        <Link href={changeHref} className="mt-2 inline-block text-sm text-[#8e8e93] underline">
          Change services or address
        </Link>
      </div>
      <TimesHelpNote className="lg:mt-0" />
    </div>
  );
}
