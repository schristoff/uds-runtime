<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2024-Present The UDS Authors -->

<script lang="ts">
  import { DataTable } from '$components'
  import { createStore, type Columns } from './store'

  export let columns: Columns = [
    ['name', 'emphasize'],
    ['namespace'],
    ['schedule'],
    ['suspend'],
    ['last_scheduled'],
    ['age'],
  ]
</script>

<DataTable {columns} {createStore} />
