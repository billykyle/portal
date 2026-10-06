import { pageHeadingWrapClass, pageStackClass, pageTitleClass } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { ShootList } from "@/components/shoot-list";
import { galleryMedia, type ContentTemplate } from "@/components/templates/types";

function DefaultLibrary({ client, shoots, closedCategoryFolders }: Parameters<ContentTemplate["Library"]>[0]) {
  return (
    <>
      <div className={pageHeadingWrapClass}>
        <h1 className={pageTitleClass}>{client?.displayName ?? "Your shoots"}</h1>
        {client?.primaryEmail ? <p className="mt-1 text-sm text-[#8e8e93]">{client.primaryEmail}</p> : null}
        {client?.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
      </div>
      <div className={pageStackClass}>
        <ShootList
          emptyLabel="No shoots yet. Billy will post them here."
          closedCategoryFolders={closedCategoryFolders}
          shoots={shoots.map((shoot) => ({
            id: shoot.id,
            href: shoot.href,
            address: shoot.address,
            shotDate: shoot.shotDate,
            dateLabel: shoot.dateLabel,
            categoryFolder: shoot.categoryFolder,
          }))}
        />
      </div>
    </>
  );
}

function DefaultAdminShoots({ shoots, closedCategoryFolders }: Parameters<ContentTemplate["AdminShoots"]>[0]) {
  return (
    <ShootList
      variant="admin"
      emptyLabel="No shoots attached yet."
      closedCategoryFolders={closedCategoryFolders}
      shoots={shoots.map((shoot) => ({
        id: shoot.id,
        href: shoot.href,
        address: shoot.address,
        shotDate: shoot.shotDate,
        dateLabel: shoot.dateLabel,
        fileCount: shoot.fileCount,
        publicToken: shoot.publicToken,
        categoryFolder: shoot.categoryFolder,
      }))}
    />
  );
}

function DefaultShoot({ media, ...props }: Parameters<ContentTemplate["Shoot"]>[0]) {
  return <ShootDetail {...props} media={galleryMedia(media)} />;
}

export const defaultTemplate: ContentTemplate = {
  Library: DefaultLibrary,
  AdminShoots: DefaultAdminShoots,
  Shoot: DefaultShoot,
};
