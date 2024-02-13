use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use solana_program::system_instruction;
// This is your program's public key and it will update
// automatically when you build the project.
declare_id!("GMT6onsr3dc3sMV3Yy68PAdaPqLZvi8LrjApQBFP6BXU");

#[program]
mod hades_payment {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;
        mystate.deposits = Vec::new();
        mystate.withdrawals = Vec::new();
        mystate.authorized_addresses = vec![ctx.accounts.signer.key()];
        mystate.deposit_index = 0;
        mystate.uid = 0;
        Ok(())
    }

    pub fn deposit_lamports(
        ctx: Context<TransferLamportsForDeposit>,
        amount: u64,
        wallet: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;
        let from_account = &ctx.accounts.from;
        let to_account = &ctx.accounts.to;

        // Create the transfer instruction
        let transfer_instruction =
            system_instruction::transfer(from_account.key, to_account.key, amount);

        // Invoke the transfer instruction
        anchor_lang::solana_program::program::invoke_signed(
            &transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;
        mystate.deposit_index += 1;

        // Record the deposit
        let deposit = DepositInfo {
            wallet,
            deposit_index: mystate.deposit_index,
            from: *ctx.accounts.from.to_account_info().key,
            to: *ctx.accounts.to.to_account_info().key,
            amount,
        };
        mystate.deposits.push(deposit);
        Ok(())
    }

    pub fn deposit_spl(
        ctx: Context<TransferSplForDeposit>,
        amount: u64,
        wallet: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;
        let destination = &ctx.accounts.to_ata;
        let source = &ctx.accounts.from_ata;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.from;

        // Transfer tokens from taker to initializer
        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;
        mystate.deposit_index += 1;

        // Record the deposit
        let deposit = DepositInfo {
            wallet,
            deposit_index: mystate.deposit_index,
            from: *ctx.accounts.from_ata.to_account_info().key,
            to: *ctx.accounts.to_ata.to_account_info().key,
            amount,
        };
        mystate.deposits.push(deposit);
        Ok(())
    }

    pub fn withdraw_lamports(
        ctx: Context<TransferLamportsForWithdraw>,
        amount: u64,
        message: String,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        if amount == 0 {
            return Err(PaymentError::InvalidAmount.into());
        }

        let from_account = &ctx.accounts.from;
        let to_account = &ctx.accounts.to;

        // Create the transfer instruction
        let transfer_instruction =
            system_instruction::transfer(from_account.key, to_account.key, amount);

        // Invoke the transfer instruction
        anchor_lang::solana_program::program::invoke_signed(
            &transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;
        mystate.uid += 1;

        // Record the deposit
        let withdraw = Withdrawal {
            from: *ctx.accounts.from.to_account_info().key,
            to: *ctx.accounts.to.to_account_info().key,
            amount,
            uid: mystate.uid,
            message,
        };
        mystate.withdrawals.push(withdraw);

        Ok(())
    }

    pub fn withdraw_spl(
        ctx: Context<TransferSplForWithdraw>,
        amount: u64,
        message: String,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        if amount == 0 {
            return Err(PaymentError::InvalidAmount.into());
        }

        let destination = &ctx.accounts.to_ata;
        let source = &ctx.accounts.from_ata;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.from;

        // Transfer tokens from taker to initializer
        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();

        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;
        mystate.uid += 1;

        // Record the deposit
        let withdraw = Withdrawal {
            from: *ctx.accounts.from_ata.to_account_info().key,
            to: *ctx.accounts.to_ata.to_account_info().key,
            amount,
            uid: mystate.uid,
            message,
        };
        mystate.withdrawals.push(withdraw);
        Ok(())
    }

    pub fn add_authorized_address(
        ctx: Context<AuthorizedAddress>,
        new_address: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        // Check if the sender is an authorized address
        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        // Check if the new address is already authorized
        if mystate.authorized_addresses.contains(&new_address) {
            return Err(PaymentError::AddressAlreadyAuthorized.into());
        }

        // Add the new address to the list of authorized addresses
        mystate.authorized_addresses.push(new_address);

        Ok(())
    }

    pub fn remove_authorized_address(
        ctx: Context<AuthorizedAddress>,
        address_to_remove: Pubkey,
    ) -> Result<()> {
        let mystate = &mut ctx.accounts.mystate;

        // Check if the sender is an authorized address
        if !mystate
            .authorized_addresses
            .contains(&ctx.accounts.authority.key())
        {
            return Err(PaymentError::Unauthorized.into());
        }

        // Find the index of the address to remove
        let index = mystate
            .authorized_addresses
            .iter()
            .position(|&addr| addr == address_to_remove)
            .ok_or(PaymentError::AddressNotFound)?;

        // Remove the address from the authorized addresses
        mystate.authorized_addresses.remove(index);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = signer, 
        space = 9000,
    )]
    pub mystate: Account<'info, MyState>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferLamportsForDeposit<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    #[account(mut)]
    pub to: AccountInfo<'info>,
    #[account(mut,)]
    pub mystate: Account<'info, MyState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSplForDeposit<'info> {
    pub from: Signer<'info>,
    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_ata: Account<'info, TokenAccount>,
    #[account(mut,)]
    pub mystate: Account<'info, MyState>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferLamportsForWithdraw<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    /// CHECK:` doc comment explaining why no checks through types are necessary
    #[account(mut)]
    pub to: AccountInfo<'info>,
    #[account(mut,)]
    pub mystate: Account<'info, MyState>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferSplForWithdraw<'info> {
    pub from: Signer<'info>,
    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_ata: Account<'info, TokenAccount>,
    #[account(mut,)]
    pub mystate: Account<'info, MyState>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct MyState {
    pub deposits: Vec<DepositInfo>,
    pub withdrawals: Vec<Withdrawal>,
    pub authorized_addresses: Vec<Pubkey>,
    pub deposit_index: u64,
    pub uid: u64,
}

#[derive(Debug, AnchorDeserialize, AnchorSerialize, Default, Clone)]
pub struct DepositInfo {
    pub wallet: Pubkey,     // Wallet information associated with the deposit
    pub deposit_index: u64, // Deposit index information
    pub from: Pubkey,       // Sender's token account
    pub to: Pubkey,         // Receiver's token account (contract's account)
    pub amount: u64,        // Amount of tokens deposited
}

#[derive(Debug, AnchorDeserialize, AnchorSerialize, Default, Clone)]
pub struct Withdrawal {
    pub from: Pubkey,    // Sender's token account (contract's account)
    pub to: Pubkey,      // Receiver's token account
    pub amount: u64,     // Amount of tokens withdrawn
    pub uid: u64,        // Withdrawal UID
    pub message: String, // Withdrawal message
}

#[derive(Accounts)]
pub struct AuthorizedAddress<'info> {
    #[account(mut)]
    pub mystate: Account<'info, MyState>, // State account of the smart contract
    pub authority: Signer<'info>, // Sender's authority
}

#[error_code]
pub enum PaymentError {
    #[msg("Your address can't authorize the this transaction")]
    Unauthorized,
    #[msg("Amount should be more than 0")]
    InvalidAmount,
    #[msg("This address has been already authorized")]
    AddressAlreadyAuthorized,
    #[msg("Sorry, that address is not valid")]
    AddressNotFound,
}
