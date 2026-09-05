-- Lua: block comments, local functions, tables and metatables.

--[[ A long block comment that
     spans multiple source lines. ]]

--[==[ A block comment using level-two brackets:
     still inside the comment ]==]

local Point = {}
Point.__index = Point

function Point.new(x, y)
  local self = setmetatable({}, Point)
  self.x = x or 0
  self.y = y or 0
  return self
end

function Point:dist(other)
  local dx = other.x - self.x
  local dy = other.y - self.y
  return math.sqrt(dx * dx + dy * dy)
end

local p = Point.new(0xFF, 1)
local q = Point.new(3, 4)
print(("dist = %.2f"):format(p:dist(q))) -- prints dist = 5.00
