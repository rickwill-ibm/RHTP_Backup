'use client';

/**
 * Top-bar right-hand action cluster (extracted from AppLayout so AppLayout stays under the size cap
 * and prettier-clean). Pure presentation: the data-mode toggle, the role/context indicator, the
 * patient switcher (hidden on payer-side authoring routes), notifications, help, and the user chip.
 * Reads the same app context AppLayout does; `roleColor` is passed in so the avatar tint matches.
 */
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { useAppContext } from '@/lib/appContext';
import PatientSwitcherDropdown from '@/components/PatientSwitcherDropdown';

export default function AppTopBarActions({ roleColor }: { roleColor: string }): React.ReactElement {
  const { user, entryContext, useMockData, setUseMockData } = useAppContext();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2">
      {/* FHIR / Mock data toggle */}
      <button
        onClick={() => setUseMockData(!useMockData)}
        title={useMockData ? 'Switch to live FHIR data' : 'Switch to mock data'}
        className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold border transition-colors ${
          useMockData
            ? 'bg-[#fff1e0] text-[#8a3800] border-[#f1c21b] hover:bg-[#fdf6dd]'
            : 'bg-[#defbe6] text-[#198038] border-[#a7f0ba] hover:bg-[#c6efcd]'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${useMockData ? 'bg-[#b45309]' : 'bg-[#24a148]'}`}
        />
        {useMockData ? 'Mock Data' : 'Live FHIR'}
      </button>
      {/* Role + context indicator */}
      <div className="hidden md:flex items-center gap-1.5 mr-2">
        <span
          className={`text-2xs font-semibold px-2 py-1 ${user.role === 'physician' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-[#d0e2ff] text-[#0043ce]'}`}
        >
          {user.role === 'physician' ? 'Physician' : 'Care Manager'}
        </span>
        <span
          className={`text-2xs font-medium px-2 py-1 ${entryContext === 'cerner-launch' ? 'bg-[#f6f2ff] text-[#6929c4]' : 'bg-carbon-gray-10 text-carbon-gray-50'}`}
        >
          {entryContext === 'cerner-launch' ? '⚡ Cerner' : 'Browse'}
        </span>
      </div>
      {/* Patient switcher — hidden on payer-side authoring routes (the policy encoder /
          reviewer), where there is no patient in context. */}
      {!pathname.startsWith('/policy-engine') && <PatientSwitcherDropdown />}
      <div className="w-px h-6 bg-carbon-gray-20 mx-1" />
      <button className="p-2 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors relative">
        <Icon name="BellIcon" size={18} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-carbon-red rounded-full" />
      </button>
      <button className="p-2 text-carbon-gray-50 hover:text-carbon-gray-100 hover:bg-carbon-gray-10 transition-colors">
        <Icon name="QuestionMarkCircleIcon" size={18} />
      </button>
      <div className="w-px h-6 bg-carbon-gray-20 mx-1" />
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center`}>
          <span className="text-white text-xs font-semibold">{user.initials}</span>
        </div>
        <span className="text-carbon-gray-70 text-xs hidden md:block">{user.name}</span>
      </div>
    </div>
  );
}
