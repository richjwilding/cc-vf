import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  ScrollShadow,
  Select,
  SelectItem,
} from '@heroui/react';
import {
  ArrowDownTrayIcon,
  Bars3Icon,
  ChevronDownIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import MainStore from './MainStore';
import { PrimitiveCard } from './PrimitiveCard';
import PrimitivePicker from './PrimitivePicker';
import { Logo } from './logo';

export default function SideNav(props) {
  const mainstore = MainStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pageDetailPane, setPageDetailPane] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const primitive = id
    ? MainStore().primitive(isNaN(id) ? id : parseInt(id))
    : undefined;
  const showDetailPaneButton = primitive?.type !== 'working';

  const isWidePage = Boolean(props.widePage);
  const forceSmall = props.widePage === 'always';

  const desktopNavVisibility = forceSmall
    ? 'hidden'
    : isWidePage
      ? 'hidden 3xl:flex'
      : 'hidden xl:flex';
  const headerVisibilityClass = forceSmall
    ? ''
    : isWidePage
      ? '3xl:hidden'
      : 'xl:hidden';
  const contentPaddingClass = forceSmall
    ? ''
    : isWidePage
      ? '3xl:pl-64'
      : 'xl:pl-64';
  const bannerClassName = forceSmall
    ? ''
    : isWidePage
      ? 'hidden 3xl:flex'
      : 'hidden xl:flex';

  const workspaces = useMemo(() => {
    const workspaceIds = mainstore.activeUser?.info?.workspaces ?? [];
    return workspaceIds
      .map((workspaceId) => MainStore().workspace(workspaceId))
      .filter(Boolean);
  }, [mainstore.activeUser?.info?.workspaces]);

  const selectedWorkspaceKeys = useMemo(() => {
    if (!props.workspace) {
      return new Set();
    }
    return new Set([String(props.workspace)]);
  }, [props.workspace]);

  const navigation = useMemo(() => {
    const path = location.pathname ?? '';
    const items = [
      { key: 'home', name: 'Home', icon: HomeIcon, href: '/' },
      mainstore.activeWorkspaceId && !mainstore.activeUser?.info?.external
        ? {
            key: 'project',
            name: 'Project Home',
            icon: SparklesIcon,
            href: `/project/${mainstore.activeWorkspaceId}`,
          }
        : null,
      {
        key: 'workflows',
        name: 'Workflows',
        icon: SparklesIcon,
        href: mainstore.activeWorkspaceId
          ? `/workflows/${mainstore.activeWorkspaceId}`
          : '/workflows',
      },
      { key: 'usage', name: 'Usage', icon: ArrowDownTrayIcon, href: '/usage' },
    ].filter(Boolean);

    return items.map((item) => {
      const current = item.href === '/' ? path === '/' : path.startsWith(item.href);
      return { ...item, current };
    });
  }, [location.pathname, mainstore.activeWorkspaceId, mainstore.activeUser?.info?.external]);

  const handleWorkspaceChange = (keys) => {
    const [selected] = Array.from(keys ?? []);
    if (!selected) {
      return;
    }
    const workspace = workspaces.find((ws) => String(ws.id) === selected);
    if (workspace) {
      props.setWorkspace?.(workspace.id);
    }
    setIsMenuOpen(false);
  };

  const handleUserAction = (action, afterClose) => {
    const key = action?.toString();
    if (key === 'account') {
      navigate('/account');
    }
    if (key === 'logout') {
      window.location.href = '/logout';
    }
    if (afterClose) {
      afterClose();
    }
  };

  const renderUserDropdown = (closeMenu, condensed = false) => (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        {condensed ? (
          <Button
            isIconOnly
            radius="full"
            size="sm"
            variant="light"
          >
            <Avatar
              size="sm"
              src={mainstore.activeUser?.info?.avatarUrl}
              referrerPolicy="no-referrer"
            />
          </Button>
        ) : (
          <Button
            className="justify-between"
            endContent={<ChevronDownIcon className="h-4 w-4" />}
            variant="light"
          >
            <span className="flex min-w-0 items-center gap-3 text-left">
              <Avatar
                size="sm"
                src={mainstore.activeUser?.info?.avatarUrl}
                referrerPolicy="no-referrer"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-default-900">
                  {mainstore.activeUser?.info?.name}
                </span>
                <span className="truncate text-xs text-default-500">
                  {(mainstore.activeOrganization?.name || '').replace(/.+@/, '')}
                </span>
              </span>
            </span>
          </Button>
        )}
      </DropdownTrigger>
      <DropdownMenu
        aria-label="User menu"
        onAction={(key) => handleUserAction(key, closeMenu)}
      >
        <DropdownItem key="account">Account Details</DropdownItem>
        <DropdownItem key="logout" color="danger">
          Logout
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );

  const renderNavigationPanel = (closeMenu) => (
    <Card className="flex h-full w-full flex-col border-none shadow-lg">
      <CardHeader className="flex items-center justify-between gap-3 pb-0">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7 shrink-0" />
          <p className="font-['Poppins'] text-xl font-black">SENSE</p>
        </div>
        {closeMenu && (
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={closeMenu}
          >
            <XMarkIcon className="h-5 w-5" />
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex flex-1 flex-col gap-4 overflow-hidden">
        <Select
          label="Project"
          placeholder="Project..."
          selectedKeys={selectedWorkspaceKeys}
          variant="bordered"
          onSelectionChange={handleWorkspaceChange}
        >
          {workspaces.map((workspace) => (
            <SelectItem key={String(workspace.id)} textValue={workspace.title}>
              <span className="flex items-center gap-2">
                <span
                  className={clsx(
                    'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
                    workspace.color?.startsWith('#')
                      ? ''
                      : `bg-${workspace.color}-500`,
                  )}
                  style={
                    workspace.color?.startsWith('#')
                      ? { backgroundColor: workspace.color }
                      : undefined
                  }
                  aria-hidden="true"
                />
                <span className="truncate">{workspace.title}</span>
              </span>
            </SelectItem>
          ))}
        </Select>
        <Input
          isReadOnly
          label="Search"
          placeholder="Search"
          variant="bordered"
          startContent={
            <MagnifyingGlassIcon className="h-4 w-4 text-default-400" />
          }
          onFocus={() => {
            setShowPicker(true);
            if (closeMenu) {
              closeMenu();
            }
          }}
        />
        <Divider />
        <ScrollShadow className="flex-1 pr-1">
          <div className="flex flex-col gap-2">
            <Button
              key="search-nav"
              className="justify-start"
              startContent={
                <MagnifyingGlassIcon className="h-5 w-5 text-default-500" />
              }
              variant="light"
              onPress={() => {
                setShowPicker(true);
                if (closeMenu) {
                  closeMenu();
                }
              }}
            >
              Search
            </Button>
            {navigation.map((item) => (
              <Button
                key={item.key}
                className="justify-start"
                color={item.current ? 'primary' : 'default'}
                startContent={<item.icon className="h-5 w-5" />}
                variant={item.current ? 'flat' : 'light'}
                onPress={() => {
                  if (closeMenu) {
                    closeMenu();
                  }
                  if (item.href) {
                    navigate(item.href);
                  }
                }}
              >
                {item.name}
              </Button>
            ))}
          </div>
        </ScrollShadow>
        <Divider />
        <div className="rounded-medium bg-default-100 px-3 py-3 text-sm text-default-600">
          Credits:
          <span className="ml-1 font-semibold text-default-800">
            {mainstore.activeOrganization?.credits ?? 0}
          </span>
        </div>
        {renderUserDropdown(closeMenu)}
      </CardBody>
    </Card>
  );

  const childContent =
    typeof props.children === 'function'
      ? props.children({
          primitive,
          hideBanner: forceSmall,
          showDetailPane: pageDetailPane,
          bannerClassName,
        })
      : props.children;

  return (
    <>
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="h-full w-64 max-w-[80vw] p-3"
            onClick={(event) => event.stopPropagation()}
          >
            {renderNavigationPanel(() => setIsMenuOpen(false))}
          </div>
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
        </div>
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 flex-col p-3',
          desktopNavVisibility,
          'bg-gradient-to-b from-white via-white to-gray-50',
          'border-r border-gray-200',
        )}
      >
        {renderNavigationPanel()}
      </aside>
      <div
        className={clsx(
          'flex h-screen flex-col bg-gray-50',
          contentPaddingClass,
        )}
      >
        <div
          className={clsx(
            'flex h-16 items-center border-b border-gray-200 bg-white px-3 shadow-sm',
            headerVisibilityClass,
          )}
        >
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => setIsMenuOpen(true)}
          >
            <Bars3Icon className="h-5 w-5" />
          </Button>
          {showDetailPaneButton && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="ml-2"
              onPress={() => setPageDetailPane((value) => !value)}
            >
              <ChevronDownIcon
                className={clsx(
                  'h-5 w-5 transition-transform',
                  pageDetailPane ? 'rotate-180' : '',
                )}
              />
            </Button>
          )}
          <div className="ml-3 flex flex-1 items-center overflow-hidden">
            {primitive && (
              <PrimitiveCard.Banner
                primitive={primitive}
                showMenu
                showStateAction={false}
                small
                className="flex-1 overflow-hidden px-0"
              />
            )}
          </div>
          <PrimitiveCard.ProcessingBase primitive={primitive} />
          <div className="ml-3 hidden sm:flex">{renderUserDropdown(undefined, true)}</div>
        </div>
        <div className="flex-1 overflow-hidden">{childContent}</div>
      </div>
      {showPicker && (
        <PrimitivePicker
          {...(typeof showPicker === 'object' ? showPicker : {})}
          setOpen={() => setShowPicker(false)}
          callback={
            typeof showPicker === 'object' && showPicker.callback
              ? showPicker.callback
              : (picked) => MainStore().sidebarSelect(picked)
          }
        />
      )}
    </>
  );
}
