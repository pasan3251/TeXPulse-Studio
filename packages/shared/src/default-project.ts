import type { ProjectFile } from "./index.js";

export const DEFAULT_PROJECT_NAME = "TeXPulse-Quantum-Notes";

export const DEFAULT_PROJECT_FILES: readonly ProjectFile[] = [
  {
    path: "main.tex",
    kind: "tex",
    lastModified: 1_763_450_000_000,
    content: String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb,hyperref}

\title{Hamiltonian Error Mitigation in Variational Quantum Circuits}
\author{TeXPulse Research Group}

\begin{document}
\maketitle

\section{Introduction}
\label{sec:intro}

Near-term quantum processors suffer from Markovian decoherence and gate calibration drift~\cite{preskill2018nisq,knuth1984texbook}.
As formalized in Section~\ref{sec:hamiltonian} and Equation~\eqref{eq:lindblad}, noise-aware rescaling recovers unbiased expectation values without deep fault-tolerant overhead~\cite{temme2017error}.

\subsection{Problem Formulation}
\label{subsec:formulation}

Let $\rho(t)$ denote the noisy quantum state evolving under a Lindbladian master generator:
\begin{equation}
\label{eq:lindblad}
\frac{d\rho}{dt} = -i[H, \rho] + \sum_{k} \gamma_k \left( L_k \rho L_k^\dagger - \frac{1}{2}\{L_k^\dagger L_k, \rho\} \right)
\end{equation}

\section{Hamiltonian Error Mitigation}
\label{sec:hamiltonian}

When estimating observable expectation values $E(\lambda) = \operatorname{Tr}(O \rho_\lambda)$, Richardson extrapolation~\cite{li2017efficient,kandala2019error} yields the zero-noise estimator in Equation~\eqref{eq:fidelity}.

\begin{align}
\label{eq:fidelity}
\hat{E}_{\text{mitigated}} &= \sum_{j=0}^{m} c_j E(\lambda_j), & \sum_{j=0}^{m} c_j &= 1
\end{align}

\subsection{Empirical Scaling Notes}
\label{subsec:scaling}

Cross-file synthesis details are derived in Section~\ref{sec:zne} and Equation~\eqref{eq:richardson}.

\input{chapters/methodology}

\bibliographystyle{plain}
\bibliography{references}
\end{document}
`,
  },
  {
    path: "chapters/methodology.tex",
    kind: "tex",
    lastModified: 1_763_450_000_000,
    content: String.raw`\section{Zero-Noise Extrapolation}
\label{sec:zne}

To amplify circuit noise cleanly by factor $c > 1$, unitary folding maps each gate layer $U_i$ to $U_i (U_i^\dagger U_i)^k$.
Under exponential depolarizing channels, the variance bound follows~\cite{temme2017error}:

\begin{equation}
\label{eq:richardson}
\operatorname{Var}[\hat{E}_{\mathrm{ZNE}}] \le \sum_{j=0}^{m} \frac{|c_j|^2 \sigma^2}{N_j}
\end{equation}

See Section~\ref{sec:intro} for notation and~\cite{vaswani2017attention} for classical attention benchmarks.
`,
  },
  {
    path: "references.bib",
    kind: "bib",
    lastModified: 1_763_450_000_000,
    content: `@book{knuth1984texbook,
  author    = {Donald E. Knuth},
  title     = {The TeXbook},
  year      = {1984},
  publisher = {Addison-Wesley}
}

@article{preskill2018nisq,
  author  = {John Preskill},
  title   = {Quantum Computing in the NISQ Era and Beyond},
  journal = {Quantum},
  year    = {2018},
  volume  = {2},
  pages   = {79}
}

@article{temme2017error,
  author  = {Kristan Temme and Sergey Bravyi and Jay M. Gambetta},
  title   = {Error Mitigation for Short-Depth Quantum Circuits},
  journal = {Physical Review Letters},
  year    = {2017},
  volume  = {119}
}

@inproceedings{li2017efficient,
  author    = {Ying Li and Simon C. Benjamin},
  title     = {Efficient Variational Quantum Simulator Incorporating Active Error Minimization},
  booktitle = {Physical Review X},
  year      = {2017}
}

@article{kandala2019error,
  author  = {Abhinav Kandala and Kristan Temme and Antonio D. Corcoles},
  title   = {Error Mitigation Extends the Computational Reach of a Noisy Quantum Processor},
  journal = {Nature},
  year    = {2019},
  volume  = {567}
}

@inproceedings{vaswani2017attention,
  author    = {Ashish Vaswani and Noam Shazeer and Niki Parmar},
  title     = {Attention Is All You Need},
  booktitle = {NeurIPS},
  year      = {2017}
}
`,
  },
];
