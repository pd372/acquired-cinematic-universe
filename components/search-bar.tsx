"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import type { NodeData } from "@/types/graph"
import { useGraphData } from "@/hooks/use-graph-data"

interface SearchBarProps {
  onNodeSelect: (nodeId: string) => void
}

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const XIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)

export default function SearchBar({ onNodeSelect }: SearchBarProps) {
  const { graphData } = useGraphData()
  const [searchTerm, setSearchTerm] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [filteredNodes, setFilteredNodes] = useState<NodeData[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLLIElement>(null)

  // Filter nodes based on search term
  useEffect(() => {
    if (!graphData || !graphData.nodes || !searchTerm.trim()) {
      setFilteredNodes([])
      return
    }

    const filtered = graphData.nodes.filter((node) => node.name.toLowerCase().includes(searchTerm.toLowerCase()))
    setFilteredNodes(filtered.slice(0, 10)) // Limit to 10 results
    setIsOpen(filtered.length > 0)
    setSelectedIndex(0) // Reset selection when results change
  }, [searchTerm, graphData])

  // Scroll selected item into view when navigating with keyboard
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [selectedIndex])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    if (e.target.value.trim()) {
      setIsOpen(true)
    }
  }

  const handleNodeClick = (nodeId: string) => {
    onNodeSelect(nodeId)
    setIsOpen(false)
    // Find the selected node to display its name in the search bar
    const selectedNode = graphData?.nodes?.find((node) => node.id === nodeId)
    if (selectedNode) {
      setSearchTerm(selectedNode.name)
    }
  }

  const handleClear = () => {
    setSearchTerm("")
    setIsOpen(false)
    inputRef.current?.focus()

    // Call onNodeSelect with null to clear highlighting
    onNodeSelect("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < filteredNodes.length - 1 ? prev + 1 : prev))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
    } else if (e.key === "Enter" && filteredNodes.length > 0) {
      e.preventDefault()
      handleNodeClick(filteredNodes[selectedIndex].id)
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const hasData = graphData && graphData.nodes && graphData.nodes.length > 0

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchTerm.trim() && setIsOpen(true)}
          placeholder={hasData ? "Search nodes..." : "No data available for search"}
          className="w-full h-10 pl-10 pr-10 rounded-full bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-[#00E5C7] focus:border-transparent shadow-lg"
          disabled={!hasData}
        />
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
          <SearchIcon />
        </div>
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <XIcon />
          </button>
        )}
      </div>

      {isOpen && filteredNodes.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-[60] mt-1 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          <ul>
            {filteredNodes.map((node, index) => (
              <li
                key={node.id}
                ref={index === selectedIndex ? selectedItemRef : null}
                onClick={() => handleNodeClick(node.id)}
                className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                  index === selectedIndex
                    ? "bg-[#00E5C7] text-gray-900"
                    : "hover:bg-gray-700"
                }`}
              >
                <span>{node.name}</span>
                <span className={`text-xs ${index === selectedIndex ? "text-gray-700" : "text-gray-400"}`}>
                  {node.type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
