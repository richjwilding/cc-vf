import React, { useCallback, useMemo, useState } from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Button,
  Select,
  SelectItem,
  Divider,
} from "@heroui/react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { HomeIcon, SparklesIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Logo } from "./logo";
import MainStore from "./MainStore";
import { Toaster } from "react-hot-toast";

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
          startContent={<item.icon className={`${NAV_ICON_SIZE}`} />}
          className={`justify-start ${orientation === "row" ? "" : "w-full"}`}
          onPress={() => onNavigate(item)}
        >
          {item.name}
        </Button>
      ))}
    </div>
  );
}

function WorkspaceSelect({ workspace, workspaces, onChange, size = "sm" }) {
  const selectedKeys = workspace
    ? new Set([String(workspace)])
    : new Set();

  return (
    <Select
      aria-label="Select workspace"
      selectedKeys={selectedKeys}
      className="w-full"
      disallowEmptySelection={workspaces.length > 0}
      selectionMode="single"
      size={size}
      variant="bordered"
      onSelectionChange={(keys) => {
        const [key] = Array.from(keys ?? []);
        if (key) {
          onChange(key);
        }
      }}
    >
      {workspaces.map((space) => (
        <SelectItem key={String(space.id)}>{space.title}</SelectItem>
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
  widePage,
  workspace,
  setWorkspace,
  children,
}) {
  const location = useLocation();
  const workspaces = useMemo(() => {
    const ids = mainstore.activeUser?.info?.workspaces ?? [];
    return ids
      .map((id) => mainstore.workspace(id))
      .filter(Boolean)
      .map((space) => ({ id: space.id, title: space.title }));
  }, [mainstore.activeUser?.info?.workspaces]);

  const navigationItems = useNavigationItems(workspace, location.pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavigate = useCallback(
    (item) => {
      item.onClick?.();
      setIsMenuOpen(false);
    },
    [setIsMenuOpen]
  );

  const handleWorkspaceChange = useCallback(
    (id) => {
      const parsed = isNaN(id) ? id : parseInt(id, 10);
      setWorkspace(parsed);
      setIsMenuOpen(false);
    },
    [setWorkspace]
  );

  const shouldShowSidebar = !(widePage === true || widePage === "always");

  return (
    <div className="flex h-screen w-full bg-gray-50">
      {shouldShowSidebar && (
        <aside className="hidden h-full w-72 flex-shrink-0 border-r border-divider bg-white lg:flex lg:flex-col">
          <div className="flex items-center gap-2 px-6 py-5">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-semibold">Sense</span>
          </div>
          <div className="px-6">
            <WorkspaceSelect
              workspace={workspace}
              workspaces={workspaces}
              onChange={handleWorkspaceChange}
            />
          </div>
          <Divider className="mt-4" />
          <div className="flex-1 overflow-y-auto px-4">
            <NavigationButtons
              items={navigationItems}
              onNavigate={handleNavigate}
            />
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          isBordered
          maxWidth="full"
          isMenuOpen={isMenuOpen}
          onMenuOpenChange={setIsMenuOpen}
          className="bg-white"
        >
          <NavbarContent
            justify="start"
            className={shouldShowSidebar ? "lg:hidden" : ""}
          >
            <NavbarMenuToggle aria-label="Toggle navigation" />
          </NavbarContent>
          <NavbarBrand className="items-center gap-2">
            <Logo className="h-6 w-6" />
            <p className="font-semibold">Sense</p>
          </NavbarBrand>
          <NavbarContent className="hidden gap-2 lg:flex" justify="start">
            <NavigationButtons
              items={navigationItems}
              onNavigate={handleNavigate}
              orientation="row"
            />
          </NavbarContent>
          <NavbarContent justify="end" className="gap-4">
            <div className="min-w-[180px]">
              <WorkspaceSelect
                workspace={workspace}
                workspaces={workspaces}
                onChange={handleWorkspaceChange}
                size="sm"
              />
            </div>
          </NavbarContent>
          <NavbarMenu>
            <div className="flex flex-col gap-4 px-4 py-4">
              <WorkspaceSelect
                workspace={workspace}
                workspaces={workspaces}
                onChange={handleWorkspaceChange}
              />
              <Divider />
              {navigationItems.map((item) => (
                <NavbarMenuItem key={item.key}>
                  <Button
                    fullWidth
                    variant={item.current ? "solid" : "light"}
                    color={item.current ? "primary" : "default"}
                    startContent={<item.icon className={`${NAV_ICON_SIZE}`} />}
                    onPress={() => handleNavigate(item)}
                  >
                    {item.name}
                  </Button>
                </NavbarMenuItem>
              ))}
            </div>
          </NavbarMenu>
        </Navbar>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-hidden bg-gray-100">
            {children ?? <Outlet />}
          </main>
        </div>
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
