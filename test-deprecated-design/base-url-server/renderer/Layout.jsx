import React from 'react'
import logo from './logo.svg'
import './Layout.css'
import { Link } from '../components/Link'

export { Layout }

function Layout({ children }) {
  return (
    <React.StrictMode>
      <Frame>
        <Sidebar>
          <Logo />
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
        </Sidebar>
        <Content>{children}</Content>
      </Frame>
    </React.StrictMode>
  )
}

function Frame({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        maxWidth: 900,
        margin: 'auto',
      }}
    >
      {children}
    </div>
  )
}

function Sidebar({ children }) {
  return (
    <div
      style={{
        padding: 20,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: '1.8em',
      }}
    >
      {children}
    </div>
  )
}

function Content({ children }) {
  return (
    <div
      style={{
        padding: 20,
        paddingBottom: 50,
        borderLeft: '2px solid #eee',
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  )
}

function Logo() {
  return (
    <div
      style={{
        marginTop: 20,
        marginBottom: 10,
      }}
    >
      <Link href="/">
        <img src={logo} height={64} width={64} />
      </Link>
    </div>
  )
}
