import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  token?: string
}

export const MagicLinkEmail = ({ siteName, token }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} sign-in code: {token ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your sign-in code</Heading>
        <Text style={text}>
          Enter this 6-digit code in {siteName} to finish signing in. The code
          expires in a few minutes.
        </Text>
        <Section style={codeWrap}>
          <Text style={code}>{token ?? '------'}</Text>
        </Section>
        <Text style={footer}>
          Didn't try to sign in? You can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '480px' }
const h1 = {
  fontFamily: 'Fraunces, Georgia, serif',
  fontSize: '26px',
  fontWeight: 500 as const,
  color: '#1f1410',
  margin: '0 0 16px',
}
const text = { fontSize: '15px', color: '#55524e', lineHeight: '1.6', margin: '0 0 24px' }
const codeWrap = {
  background: 'linear-gradient(135deg, #fff4e6 0%, #ffe4c4 100%)',
  borderRadius: '20px',
  padding: '28px 16px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const code = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: '40px',
  fontWeight: 700 as const,
  color: '#b8541a',
  letterSpacing: '0.4em',
  margin: 0,
}
const footer = { fontSize: '12px', color: '#9a958f', margin: '24px 0 0' }
