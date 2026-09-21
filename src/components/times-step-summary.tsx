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
