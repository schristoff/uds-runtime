// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024-Present The UDS Authors

import type { KubernetesObject } from '@kubernetes/client-node'
import { formatDistanceToNow } from 'date-fns'
import { derived, writable, type Writable } from 'svelte/store'

import { SearchByType, type CommonRow, type ResourceWithTable } from './types'

export class ResourceStore<T extends KubernetesObject, U extends CommonRow> {
  // Keep an internal store for the resources
  private resources: Writable<ResourceWithTable<T, U>[]>

  // Keep track of whether the store has been initialized
  private initialized = false

  // Keep an internal reference to the EventSource and the table
  private eventSource: EventSource | null = null
  private table: ResourceWithTable<T, U>[] = []

  // Keep an internal reference to the age timer
  private ageTimer: NodeJS.Timeout | null = null
  private ageTimerSeconds = 60
  private ageTimerStore: Writable<number> = writable(0)

  // Additional callback to stop the EventSource
  public stopCallback?: () => void
  public filterCallback?: (resources: ResourceWithTable<T, U>[]) => ResourceWithTable<T, U>[]

  // Public stores for the search text, search by type, and sorting options
  public search: Writable<string>
  public searchBy: Writable<SearchByType>
  public sortBy: Writable<keyof U>
  public sortAsc: Writable<boolean>
  public namespace: Writable<string>
  public additionalStores: Writable<unknown>[] = []

  // The list of search types
  public searchTypes = Object.values(SearchByType)
  /**
   * Create a new ResourceStore instance
   *
   * @param sortBy The initial key to sort the table by
   * @param sortAsc The initial sort direction
   */
  constructor(sortBy: keyof U, sortAsc = true) {
    // Initialize the internal store
    this.resources = writable<ResourceWithTable<T, U>[]>([])

    // Initialize the public stores
    this.search = writable<string>('')
    this.searchBy = writable<SearchByType>(SearchByType.ANYWHERE)
    this.sortBy = writable<keyof U>(sortBy)
    this.sortAsc = writable<boolean>(sortAsc)
    this.namespace = writable<string>('')

    // Create a derived store that combines all the filtering and sorting logic
    const filteredAndSortedResources = derived(
      [
        this.resources,
        this.namespace,
        this.search,
        this.searchBy,
        this.sortBy,
        this.sortAsc,
        this.ageTimerStore,
        ...this.additionalStores,
      ],
      ([$resources, $namespace, $search, $searchBy, $sortBy, $sortAsc]) => {
        let filtered = $resources

        // If there is a namespace, filter the resources
        if ($namespace) {
          filtered = filtered.filter((item) => item.resource.metadata?.namespace === $namespace)
        }

        // If there is a search term, filter the resources
        if ($search) {
          filtered = filtered.filter((item) => {
            let searchContents = ''

            // Determine what to search by
            switch ($searchBy) {
              case SearchByType.METADATA:
                searchContents = JSON.stringify(item.resource.metadata)
                break
              case SearchByType.NAME:
                searchContents = item.resource.metadata?.name ?? ''
                break
              // Default to anywhere (the entire resource)
              default:
                searchContents = JSON.stringify(item)
            }

            // Perform a case-insensitive search
            return searchContents.toLowerCase().includes($search.toLowerCase())
          })
        }

        // Clear the age timer if it exists and start a new one
        clearTimeout(this.ageTimer as NodeJS.Timeout)
        setTimeout(() => {
          this.ageTimerStore.update((tick) => tick + 1)
        }, 1000 * this.ageTimerSeconds)

        // Update the age of the resources
        filtered.forEach((item) => {
          item.table.age = {
            text: formatDistanceToNow(item.table.creationTimestamp),
            sort: item.table.creationTimestamp.getTime(),
          }
        })

        // If there is a filter callback, run the data through it
        if (this.filterCallback) {
          filtered = this.filterCallback(filtered)
        }

        // Sort the resources by the sortBy key
        return filtered.sort((a, b) => {
          // If the value is an object with a sort key, use that
          const valueA = (a.table[$sortBy] as { sort: number }).sort ?? a.table[$sortBy]
          const valueB = (b.table[$sortBy] as { sort: number }).sort ?? b.table[$sortBy]
          if (valueA < valueB) return $sortAsc ? -1 : 1
          if (valueA > valueB) return $sortAsc ? 1 : -1
          return 0
        })
      },
    )

    // Replace the subscribe method to use the derived store
    this.subscribe = filteredAndSortedResources.subscribe
  }

  /**
   * Update the searchBy key
   *
   * @param key The key to search by
   */
  sortByKey(key: keyof U) {
    this.sortBy.update((currentSortBy) => {
      // If the key is the same as the current sortBy key, toggle the sort direction
      if (key === currentSortBy) {
        this.sortAsc.update((asc) => !asc)
        return currentSortBy
      }

      // Otherwise, update the sortBy key
      return key
    })
  }

  /**
   * Start the EventSource and update the resources
   *
   * @param url The URL to the EventSource
   * @param createTableCallback The callback to create the table from the resources
   *
   * @returns A function to stop the EventSource
   */
  start(url: string, createTableCallback: (data: T[]) => ResourceWithTable<T, U>[]) {
    // If the store has already been initialized, return
    if (this.initialized) {
      return () => {}
    }

    this.initialized = true
    this.eventSource = new EventSource(url)

    this.eventSource.onmessage = ({ data }) => {
      try {
        this.table = createTableCallback(JSON.parse(data))
        this.resources.set(this.table)
      } catch (err) {
        console.error('Error updating resources:', err)
      }
    }

    this.eventSource.onerror = (err) => {
      console.error('EventSource failed:', err)
    }

    return () => this.stop()
  }

  stop() {
    if (this.stopCallback) {
      this.stopCallback()
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      clearTimeout(this.ageTimer as NodeJS.Timeout)
    }
  }

  subscribe: (run: (value: ResourceWithTable<T, U>[]) => void) => () => void
}

/**
 * Create a new ResourceStore instance
 * @param initialSortBy The initial key to sort the table by
 * @returns A new ResourceStore instance
 */
export function createResourceStore<T extends KubernetesObject, U extends CommonRow>(initialSortBy: keyof U) {
  return new ResourceStore<T, U>(initialSortBy)
}

/**
 * Transform KubernetesObject resources into a common table format
 *
 * @param transformer The transformer function to apply to each resource
 * @returns A function to transform KubernetesObject resources
 */
export function transformResource<T extends KubernetesObject, U extends CommonRow>(
  transformer: (r: T, c?: CommonRow) => Partial<U>,
) {
  // Return a function to transform KubernetesObject resources
  return (resources: T[]) =>
    // Map the resources to the common table format
    resources.map<ResourceWithTable<T, U>>((r) => {
      // Convert common KubernetesObject rows
      const commonRows = {
        name: r.metadata?.name ?? '',
        namespace: r.metadata?.namespace ?? '',
        creationTimestamp: new Date(r.metadata?.creationTimestamp ?? ''),
      }

      // Run the transformer on the resource
      const results = transformer(r, commonRows)

      // Return the resource with the combined table
      return {
        resource: r,
        table: {
          ...commonRows,
          ...results,
        } as U,
      }
    })
}
