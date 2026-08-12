import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{children}
		</svg>
	);
}

export const IconImage = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<circle cx="8.5" cy="8.5" r="1.5" />
		<path d="m21 15-4.5-4.5L7 21" />
	</Icon>
);

export const IconFilePdf = (props: IconProps) => (
	<Icon {...props}>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<path d="M14 2v6h6" />
		<path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6" />
		<path d="M14.5 18v-6h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2z" />
	</Icon>
);

export const IconUpload = (props: IconProps) => (
	<Icon {...props}>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<path d="m7 9 5-5 5 5" />
		<path d="M12 4v12" />
	</Icon>
);

export const IconDownload = (props: IconProps) => (
	<Icon {...props}>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<path d="m7 11 5 5 5-5" />
		<path d="M12 16V4" />
	</Icon>
);

export const IconTrash = (props: IconProps) => (
	<Icon {...props}>
		<path d="M3 6h18" />
		<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
		<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
		<path d="M10 11v6M14 11v6" />
	</Icon>
);

export const IconRotateCw = (props: IconProps) => (
	<Icon {...props}>
		<path d="M21 12a9 9 0 1 1-3.2-6.9" />
		<path d="M21 3v6h-6" />
	</Icon>
);

export const IconRotateCcw = (props: IconProps) => (
	<Icon {...props}>
		<path d="M3 12a9 9 0 1 0 3.2-6.9" />
		<path d="M3 3v6h6" />
	</Icon>
);

export const IconSun = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
	</Icon>
);

export const IconMoon = (props: IconProps) => (
	<Icon {...props}>
		<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" />
	</Icon>
);

export const IconMonitor = (props: IconProps) => (
	<Icon {...props}>
		<rect x="2" y="3" width="20" height="14" rx="2" />
		<path d="M8 21h8M12 17v4" />
	</Icon>
);

export const IconGrip = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="9" cy="6" r="1" fill="currentColor" />
		<circle cx="9" cy="12" r="1" fill="currentColor" />
		<circle cx="9" cy="18" r="1" fill="currentColor" />
		<circle cx="15" cy="6" r="1" fill="currentColor" />
		<circle cx="15" cy="12" r="1" fill="currentColor" />
		<circle cx="15" cy="18" r="1" fill="currentColor" />
	</Icon>
);

export const IconCheck = (props: IconProps) => (
	<Icon {...props}>
		<path d="m20 6-11 11-5-5" />
	</Icon>
);

export const IconClose = (props: IconProps) => (
	<Icon {...props}>
		<path d="M18 6 6 18M6 6l12 12" />
	</Icon>
);

export const IconAlert = (props: IconProps) => (
	<Icon {...props}>
		<path d="M12 9v4M12 17h.01" />
		<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />
	</Icon>
);

export const IconInfo = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 16v-4M12 8h.01" />
	</Icon>
);

export const IconSort = (props: IconProps) => (
	<Icon {...props}>
		<path d="M3 6h12M3 12h9M3 18h6" />
		<path d="m17 8 3-3 3 3M20 5v14" />
	</Icon>
);

export const IconLock = (props: IconProps) => (
	<Icon {...props}>
		<rect x="4" y="10" width="16" height="11" rx="2" />
		<path d="M8 10V7a4 4 0 0 1 8 0v3" />
	</Icon>
);

export const IconMerge = (props: IconProps) => (
	<Icon {...props}>
		<path d="M7 3v6a5 5 0 0 0 5 5h5" />
		<path d="M17 3v6a5 5 0 0 1-5 5H7" />
		<path d="m14 11 3 3-3 3" />
	</Icon>
);

export const IconScissors = (props: IconProps) => (
	<Icon {...props}>
		<circle cx="6" cy="6" r="3" />
		<circle cx="6" cy="18" r="3" />
		<path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
	</Icon>
);

export const IconSpinner = (props: IconProps) => (
	<Icon {...props}>
		<path d="M12 3a9 9 0 1 0 9 9" />
	</Icon>
);

export const IconKeyboard = (props: IconProps) => (
	<Icon {...props}>
		<rect x="2" y="6" width="20" height="12" rx="2" />
		<path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
	</Icon>
);

export const IconGithub = (props: IconProps) => (
	<Icon {...props}>
		<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 19.9 5a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C6.9 1.1 5.8 1.4 5.8 1.4A4.9 4.9 0 0 0 5.7 5a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22" />
	</Icon>
);

export const IconLayers = (props: IconProps) => (
	<Icon {...props}>
		<path d="m12 2 9 5-9 5-9-5z" />
		<path d="m3 12 9 5 9-5" />
		<path d="m3 17 9 5 9-5" />
	</Icon>
);

export const IconSelectAll = (props: IconProps) => (
	<Icon {...props}>
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<path d="m8 12 3 3 5-6" />
	</Icon>
);

export const IconResize = (props: IconProps) => (
	<Icon {...props}>
		<path d="M15 3h6v6" />
		<path d="M21 3 14 10" />
		<path d="M9 21H3v-6" />
		<path d="m3 21 7-7" />
	</Icon>
);
