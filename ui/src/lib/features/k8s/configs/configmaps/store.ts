// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024-Present The UDS Authors

import type { V1Secret as Resource } from '@kubernetes/client-node'

import { ResourceStore, transformResource } from '$features/k8s/store'
import { type ColumnWrapper, type CommonRow, type ResourceStoreInterface } from '$features/k8s/types'

export interface Row extends CommonRow {
  keys: string
}

export type Columns = ColumnWrapper<Row>

export function createStore(): ResourceStoreInterface<Resource, Row> {
  const url = `/api/v1/resources/configs/configmaps`

  const transform = transformResource<Resource, Row>((r) => ({
    keys: Object.keys(r.data ?? {}).join(', '),
  }))

  const store = new ResourceStore<Resource, Row>('name', true)

  return {
    ...store,
    start: () => store.start(url, transform),
    sortByKey: store.sortByKey.bind(store),
  }
}
