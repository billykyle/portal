import { CLIENT_CATEGORIES, CLIENT_CATEGORY_LABEL, type ClientCategory } from "@/lib/client-category";

export function CategoryField({ defaultValue }: { defaultValue: ClientCategory }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="category" className="text-[16px] font-normal text-white">
        Category
      </label>
      <select
        id="category"
        name="category"
        defaultValue={defaultValue}
        className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none"
      >
        {CLIENT_CATEGORIES.map((value) => (
          <option key={value} value={value}>
            {CLIENT_CATEGORY_LABEL[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
