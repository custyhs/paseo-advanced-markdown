# Full spec pass

> A quote with inline math $\lim_{x \to 0} \frac{\sin x}{x} = 1$ and **emphasis**.

1. Ordered item with $\vec{v} \cdot \vec{w}$
2. Second item with a very long formula:

$$
f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n + \int_{-\infty}^{\infty} e^{-t^2}\,dt \cdot \prod_{k=1}^{m} \left(1 + \frac{\lambda_k}{\mu_k}\right) - \oint_{\partial \Omega} \mathbf{F} \cdot d\mathbf{S} + \lim_{N \to \infty} \frac{1}{N}\sum_{i=1}^{N} X_i^2
$$

Invalid TeX stays readable: $\unknowncommand{x}$ next to valid $\alpha + \beta$.

```mermaid
sequenceDiagram
  participant 用户
  participant 服务
  用户->>服务: 请求
  服务-->>用户: 响应
```

```mermaid
classDiagram
  class Animal { +String name +speak() }
  Animal <|-- Dog
```

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> [*]
```

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : contains
```

```mermaid
gantt
  title 计划
  dateFormat YYYY-MM-DD
  section A
  任务一 :a1, 2026-09-01, 3d
  任务二 :after a1, 2d
```

```mermaid
flowchart LR
  A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7 --> A8 --> A9 --> A10 --> A11 --> A12 --> A13 --> A14 --> A15 --> A16 --> A17 --> A18 --> A19 --> A20
```

```mermaid
flowchart LR
  this is not valid mermaid --> [[[
```

Currency $12.50 and $3 stay text; `inline $code$` stays code.

```math
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
```
