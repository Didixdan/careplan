declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    role: 'admin' | 'assistant' | 'viewer'
    assistantId?: string
    beneficiaryId?: string
  }
}

export {}
