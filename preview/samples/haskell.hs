-- Haskell: pure functions, type signatures and list comprehensions.
module Main where

-- | Euclidean distance between two points.
dist :: (Double, Double) -> (Double, Double) -> Double
dist (x1, y1) (x2, y2) =
  let dx = x1 - x2   -- horizontal delta
      dy = y1 - y2
  in sqrt (dx * dx + dy * dy)

-- compute the sum of squares of even numbers
sumSquares :: [Int] -> Int
sumSquares xs = sum [x * x | x <- xs, even x]

main :: IO ()
main = do
  let p = (0xFF, 1)
      q = (3.0, 4.0)
  putStrLn ("dist = " ++ show (dist p q))
  print (sumSquares [1 .. 10])
