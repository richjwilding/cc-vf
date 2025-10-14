import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Divider,
  Drawer as SidebarDrawer,
  DrawerBody,
  DrawerContent,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Select,
  SelectItem,
} from "@heroui/react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownTrayIcon,
  Bars3Icon,
  HomeIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Logo } from "./logo";
import MainStore from "./MainStore";
import PrimitiveConfig from "./PrimitiveConfig";
import { Toaster } from "react-hot-toast";
import { Icon } from "@iconify/react";

const mainstore = MainStore();

const NAV_ICON_SIZE = "h-4 w-4";

function NavigationButtons({ items, onNavigate, orientation = "column" }) {
  const layoutClass =
    orientation === "row"
      ? "flex-row items-center gap-2"
      : "flex-col gap-2 py-2";

  return (
    <div className={`flex ${layoutClass}`}>
      {items.map((item) => (
        <Button
          key={item.key}
          variant={item.current ? "solid" : "light"}
          color={item.current ? "primary" : "default"}
          startContent={<item.icon className={NAV_ICON_SIZE} />}
          className={orientation === "row" ? "" : "w-full justify-start"}
          onPress={() => onNavigate(item)}
        >
          {item.name}
        </Button>
      ))}
    </div>
  );
}

function WorkspaceSelect({ workspace, workspaces, onChange, size = "md" }) {
  const selectedKeys = workspace ? new Set([String(workspace)]) : new Set();

  const renderVisual = (space, isBordered = true) => {
    if (!space) {
      return (
        <span className="inline-flex h-3 w-3 rounded-full border border-default-200 bg-default-200" />
      );
    }
    const color = space.color || "#2563eb";
    const icon = space.icon;
    const imageUrl = space.imageUrl;
    if (icon) {
      return (
        <Icon
          icon={icon}
          className="h-4 w-4"
          style={{ color }}
          aria-hidden="true"
        />
      );
    }else if (imageUrl) {
      return (
       <Avatar
        isBordered={isBordered}
        className="h-5 w-5 logo"
        src={imageUrl}
      />
      );
    }
    return (
       <div className="flex h-5 inline-flex justify-center place-items-center w-5">
        <span
          className="inline-flex h-3 w-3 rounded-full border border-default-200"
          style={{ backgroundColor: color }}
          aria-hidden="true"
          />
        </div>
    );
  };

  const renderValue = (items) => {
    if (items.length === 0) {
      return <span className="text-default-400">Select workspace</span>;
    }
    const selected = workspaces.find(
      (space) => String(space.id) === String(items[0].key)
    );
    return (
      <div className="flex items-center gap-2">
        {renderVisual(selected, false)}
        <span className="truncate text-sm font-medium text-default-700">
          {selected?.title ?? items[0].textValue}
        </span>
      </div>
    );
  };

  return (
    <Select
      aria-label="Select workspace"
      selectedKeys={selectedKeys}
      className="w-full"
      disallowEmptySelection={workspaces.length > 0}
      selectionMode="single"
      size={size}
      variant="bordered"
      renderValue={renderValue}
      onSelectionChange={(keys) => {
        const [key] = Array.from(keys ?? []);
        if (key) {
          onChange(key);
        }
      }}
    >
      {workspaces.map((space) => (
        <SelectItem
          key={String(space.id)}
          textValue={space.title}
          startContent={renderVisual(space)}
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium text-default-700">
              {space.title}
            </span>
            {space.description && (
              <span className="text-xs text-default-400 truncate">
                {space.description}
              </span>
            )}
          </div>
        </SelectItem>
      ))}
    </Select>
  );
}

function useNavigationItems(workspaceId, locationPath) {
  const navigate = useNavigate();

  return useMemo(() => {
    const baseItems = [
      {
        key: "home",
        name: "Home",
        icon: HomeIcon,
        onClick: () => navigate("/"),
        current: locationPath === "/",
      },
      mainstore.activeWorkspaceId && !mainstore.activeUser?.info?.external
        ? {
            key: "project",
            name: "Project Home",
            icon: SparklesIcon,
            onClick: () => navigate(`/project/${mainstore.activeWorkspaceId}`),
            current: locationPath.startsWith("/project"),
          }
        : null,
      {
        key: "workflows",
        name: "Workflows",
        icon: SparklesIcon,
        onClick: () =>
          navigate(
            mainstore.activeWorkspaceId
              ? `/workflows/${mainstore.activeWorkspaceId}`
              : "/workflows"
          ),
        current: locationPath.startsWith("/workflows"),
      },
      {
        key: "usage",
        name: "Usage",
        icon: ArrowDownTrayIcon,
        onClick: () => navigate("/usage"),
        current: locationPath.startsWith("/usage"),
      },
    ];

    return baseItems.filter(Boolean);
  }, [locationPath, navigate, workspaceId]);
}

export default function ApplicationLayout({
  workspace,
  setWorkspace,
  children,
}) {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const path = location.pathname;

  let layoutPrimitive;
  const itemMatch = path.match(/^\/item\/([^/]+)/);
  if (itemMatch) {
    const rawId = itemMatch[1];
    const parsedId = Number.isNaN(Number(rawId)) ? rawId : Number(rawId);
    layoutPrimitive = mainstore.primitive(parsedId);
  }

  const widePage = useMemo(() => {
    if (path.startsWith("/login") || path.startsWith("/signup")) {
      return false;
    }
    if (
      path.startsWith("/workflows") ||
      path.startsWith("/usage") ||
      path.startsWith("/account") ||
      path.startsWith("/queue") ||
      path.startsWith("/queues") ||
      path.startsWith("/project")
    ) {
      return false;
    }

    if (layoutPrimitive) {
      const alwaysWideTypes = new Set(["board", "flow", "flowinstance", "working", "page"]);
      if (alwaysWideTypes.has(layoutPrimitive.type)) {
        return true;
      }
      if (PrimitiveConfig.pageview?.[layoutPrimitive.type]?.defaultWide) {
        return true;
      }
    }

    return false;
  }, [layoutPrimitive?.id, layoutPrimitive?.type, path]);
  const workspaces = useMemo(() => {
    const ids = mainstore.activeUser?.info?.workspaces ?? [];
    return ids
      .map((id) => mainstore.workspace(id))
      .filter(Boolean)
      .map((space) => ({
        id: space.id,
        title: space.title,
        description: space.metadata?.description,
        icon: space.metadata?.icon || space.icon,
        imageUrl: space.logoUrl,
        color:
          space.metadata?.color || space.color || space.themeColor || "#2563eb",
      }));
  }, [mainstore.activeUser?.info?.workspaces]);

  const navigationItems = useNavigationItems(workspace, location.pathname);
  const isFullWidth = !!widePage;
  const showStaticSidebar = !isFullWidth;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleNavigate = useCallback(
    (item, closeDrawer) => {
      item.onClick?.();
      closeDrawer?.();
      setIsDrawerOpen(false);
    },
    []
  );

  const handleWorkspaceChange = useCallback(
    (id, closeDrawer) => {
      setWorkspace(id);
      routerNavigate(`/project/${mainstore.activeWorkspaceId}`)
      closeDrawer?.();
      setIsDrawerOpen(false);
    },
    [setWorkspace]
  );

  const handleUserAction = useCallback(
    (key, closeDrawer) => {
      if (key === "account") {
        routerNavigate("/account");
      } else if (key === "logout") {
        window.location.href = "/logout";
      }
      closeDrawer?.();
      setIsDrawerOpen(false);
    },
    [routerNavigate]
  );

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [isFullWidth]);

  const creditsAvailable = mainstore.activeOrganization?.credits ?? 0;
  const userInfo = mainstore.activeUser?.info;

  const renderNavigation = (closeDrawer) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <div className="flex items-center gap-2">
          <Logo className="h-9 w-9" />
           <p className="font-['Poppins'] font-black font-family-[Poppins] text-xl lg:text-2xl">SENSE</p>
        </div>
        {closeDrawer && (
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={closeDrawer}
            className="shadow-sm"
          >
            <XMarkIcon className="h-5 w-5" />
          </Button>
        )}
      </div>
      <div className="px-6 pb-4 space-y-4">
        <WorkspaceSelect
          workspace={workspace}
          workspaces={workspaces}
          onChange={(id) => handleWorkspaceChange(id, closeDrawer)}
        />
      </div>
      <Divider />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <NavigationButtons
          items={navigationItems}
          onNavigate={(item) => handleNavigate(item, closeDrawer)}
        />
      </div>
      <Divider />
      <div className="px-6 py-4">
        <div className="rounded-lg border border-default-200 bg-default-100 px-4 py-3 text-sm text-default-600">
          <span className="block text-xs uppercase tracking-wide text-default-400">Credits available</span>
          <span className="text-lg font-semibold text-default-700">{creditsAvailable}</span>
        </div>
        </div>
      <div className="border-t border-default-200 px-6 py-5">
        <Dropdown
          placement="top"
        >
          <DropdownTrigger>
            <Button variant="light" className="w-full justify-start gap-3">
              <Avatar
                radius="full"
                size="sm"
                src={userInfo?.avatarUrl}
                className="border border-default-200"
              />
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-medium text-default-700">
                  {userInfo?.name ?? "User"}
                </p>
                <p className="truncate text-xs text-default-400">
                  {mainstore.activeOrganization?.name ?? ""}
                </p>
              </div>
            </Button>
          </DropdownTrigger>
          <DropdownMenu 
              onAction={(key) => handleUserAction(key, closeDrawer)}
              aria-label="Profile actions" 
              variant="flat">
            <DropdownItem key="account">Account settings</DropdownItem>
            <DropdownItem key="logout" color="danger">
              Log out
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );

  const outletElement = children ?? <Outlet context={{ widePage }} />;


  return (
    <div className="flex h-screen w-full bg-gray-50">
      {showStaticSidebar && (
        <aside className="hidden h-full w-72 flex-shrink-0 flex-col border-r border-divider bg-background lg:flex">
          {renderNavigation(null)}
        </aside>
      )}

      <SidebarDrawer
        placement="left"
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        hideCloseButton
        backdrop="blur"
        size="sm"
        classNames={{
          base: "h-full max-h-none w-72 max-w-none rounded-none border-r border-divider bg-background",
          wrapper: "z-[60]",
        }}
      >
        <DrawerContent>
          {(onClose) => (
            <DrawerBody className="p-0">
              {renderNavigation(onClose)}
            </DrawerBody>
          )}
        </DrawerContent>
      </SidebarDrawer>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {isFullWidth ? (
          <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-default-200 bg-white/90 px-2">
            <div className="flex items-center space-x-2 h-full">
              <Button
                isIconOnly
                variant="light"
                size="lg"
                radius="full"
                className="p-1"
                onPress={() => setIsDrawerOpen(true)}
              >
                <Logo/>
              </Button>
              <Divider orientation="vertical"/>
              <div className="flex flex-col space-y-0.5 pl-1">
                <span className="text-lg font-bold text-default-700">
                  {layoutPrimitive?.title ?? ""}
                </span>
                <span className="text-sm font-medium text-default-500">
                  {layoutPrimitive?.displayType} #{layoutPrimitive?.plainId ?? ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-default-200 bg-default-100 px-3 py-1 text-xs text-default-500">
                Credits: <span className="font-semibold text-default-700">{creditsAvailable}</span>
              </div>
              <Dropdown>
                <DropdownTrigger>
                  <Button isIconOnly variant="light" className="border border-default-200">
                    <Avatar
                      radius="full"
                      size="sm"
                      src={userInfo?.avatarUrl}
                      className="border border-default-200"
                    />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu onAction={(key) => handleUserAction(key)} placement="bottom-end" aria-label="Profile actions" variant="flat">
                  <DropdownItem key="account">Account settings</DropdownItem>
                  <DropdownItem key="logout" color="danger">
                    Log out
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-default-200 bg-white/90 px-4 backdrop-blur lg:hidden">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              className="border border-default-200"
              onPress={() => setIsDrawerOpen(true)}
            >
              <Bars3Icon className="h-5 w-5" />
            </Button>
            <span className="text-sm font-semibold text-default-700">Sense</span>
            <Dropdown onAction={(key) => handleUserAction(key)} placement="bottom-end">
              <DropdownTrigger>
                <Button isIconOnly variant="light" className="border border-default-200">
                  <Avatar
                    radius="full"
                    size="sm"
                    src={userInfo?.avatarUrl}
                    className="border border-default-200"
                  />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Profile actions" variant="flat">
                <DropdownItem key="account">Account settings</DropdownItem>
                <DropdownItem key="logout" color="danger">
                  Log out
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </header>
        )}

        <main className="flex-1 overflow-hidden bg-gray-100">{outletElement}</main>
      </div>
      <Toaster
        position="bottom-right"
        reverseOrder={true}
        gutter={8}
        toastOptions={{
          className: "",
          style: {
            background: "#f3fcf6",
            border: "1px solid #00d967",
          },
        }}
      />
    </div>
  );
}
