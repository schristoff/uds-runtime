// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024-Present The UDS Authors

import '@testing-library/jest-dom'
import { writable } from 'svelte/store'

import { testK8sTableWithCustomColumns, testK8sTableWithDefaults } from '../test-helper'
import Component from './component.svelte'

vi.mock('$app/stores', () => {
  const namespaces = writable(true)

  return {
    page: writable({ data: { namespaces } }),
  }
})

suite('NamespaceTable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Use expect.any(Function), because createStore is wrapped
  testK8sTableWithDefaults(Component, {
    createStore: expect.any(Function),
    columns: [['name', 'emphasize'], ['status'], ['age']],
    isNamespaced: false,
  })

  testK8sTableWithCustomColumns(Component, { createStore: expect.any(Function), isNamespaced: false })
})
