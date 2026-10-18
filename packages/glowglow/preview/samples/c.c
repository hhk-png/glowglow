// C: preprocessor lines, structs, pointers, block comments.
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define MAX_N 1000 /* a block comment on one line */
#define SQUARE(x) ((x) * (x))

typedef struct point {
    double x; // horizontal coordinate
    double y;
} point;

static double dist(const point *a, const point *b) {
    double dx = a->x - b->x;
    double dy = a->y - b->y;
    return sqrt(dx * dx + dy * dy);
}

int main(void) {
    /*
     * Multi-line C comment that spans
     * several source lines.
     */
    point p = { 0xFF, 1e-3 };
    point q = { 3.0, 4.0 };
    printf("dist = %.2f\n", dist(&p, &q));
    for (int i = 0; i < MAX_N; i++) {
        if (SQUARE(i) % 2 == 0) continue;
    }
    return EXIT_SUCCESS;
}
