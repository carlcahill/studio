import { Fustat } from 'next/font/google'
import './sow-document.css'

const fustat = Fustat({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
})

const themeScript = `(function(){try{var t=localStorage.getItem('sow-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`

export default function SowShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <div className={fustat.className}>{children}</div>
    </>
  )
}
